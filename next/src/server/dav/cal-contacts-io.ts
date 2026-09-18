import {
	getAddressBook,
	principalUriForUser as addressBookPrincipalUri,
	putVCard,
} from '@/src/server/dav/addressbooks-store';
import {
	getCalendar,
	getCalendarsForPrincipal,
	principalUriForUser as calendarPrincipalUri,
	putCalendarObject,
	userExists as calendarUserExists,
	type CalendarRecord,
} from '@/src/server/dav/calendars-store';
import { isAdminUserId } from '@/src/server/ocs/admin-auth';
import { requireAuthenticatedUser, resolveAuthenticatedUserId } from '@/src/server/ocs/auth';
import {
	ocsFailureResponse,
	ocsUnauthorizedResponse,
	parseOcsVersion,
} from '@/src/server/ocs/respond';
import { getServerVersionString } from '@/src/server/version';

export const EXPORT_FORMATS = ['ical', 'jcal', 'xcal'] as const;
type ExportFormat = (typeof EXPORT_FORMATS)[number];

const CALENDAR_IMPORT_FORMATS = new Set(['ical', 'jcal', 'xcal']);
const CONTACTS_IMPORT_FORMATS = new Set(['vcf']);

interface ExportBody {
	target?: string;
	type?: string | null;
	options?: {
		rangeStart?: string;
		rangeCount?: number;
	} | null;
	user?: string | null;
}

interface ImportBody {
	transaction?: string;
	target?: string;
	options?: {
		format?: string;
		validation?: number;
		errors?: number;
		supersede?: boolean;
	} | null;
	data?: string;
	user?: string | null;
}

type ImportEvent =
	| { type: 'control'; transaction: string; disposition: 'start' | 'end' }
	| { type: 'count'; vevent?: number; vtodo?: number; vjournal?: number; vcard?: number; transaction: string }
	| { type: 'object'; identifier: string | null; disposition: string; errors: string[]; transaction: string };

function ocsEmptyUnauthorized(request: Request): Response {
	const ocsVersion = parseOcsVersion(request);

	return ocsFailureResponse(ocsVersion, 401, '', []);
}

function ocsErrorResponse(request: Request, error: string): Response {
	return ocsFailureResponse(parseOcsVersion(request), 400, '', { error });
}

async function parseJsonBody<T>(request: Request): Promise<T | null> {
	try {
		return await request.json() as T;
	} catch {
		return null;
	}
}

function resolveImportUserId(
	request: Request,
	sessionUserId: string,
	requestedUser: string | null | undefined,
): string | Response {
	if (requestedUser != null) {
		if (sessionUserId !== requestedUser && !isAdminUserId(sessionUserId)) {
			return ocsEmptyUnauthorized(request);
		}

		if (!calendarUserExists(requestedUser)) {
			return ocsFailureResponse(parseOcsVersion(request), 400, '', { error: 'user not found' });
		}

		return requestedUser;
	}

	return sessionUserId;
}

function resolveExportUserId(
	request: Request,
	sessionUserId: string,
	requestedUser: string | null | undefined,
): string | undefined | Response {
	if (requestedUser != null) {
		if (sessionUserId !== requestedUser && !isAdminUserId(sessionUserId)) {
			return ocsEmptyUnauthorized(request);
		}

		if (!calendarUserExists(requestedUser)) {
			return ocsFailureResponse(parseOcsVersion(request), 400, '', { error: 'user not found' });
		}

		return undefined;
	}

	return sessionUserId;
}

function contentTypeForFormat(format: ExportFormat): string {
	switch (format) {
		case 'jcal':
			return 'application/calendar+json; charset=UTF-8';
		case 'xcal':
			return 'application/calendar+xml; charset=UTF-8';
		default:
			return 'text/calendar; charset=UTF-8';
	}
}

function extractIcalComponents(content: string): string[] {
	const normalized = content.replace(/\r\n/g, '\n');
	const components: string[] = [];

	for (const type of ['VEVENT', 'VTODO', 'VJOURNAL', 'VTIMEZONE']) {
		const pattern = new RegExp(`BEGIN:${type}[\\s\\S]*?END:${type}`, 'g');

		for (const match of normalized.matchAll(pattern)) {
			components.push(match[0].replace(/\n/g, '\r\n'));
		}
	}

	return components;
}

function exportStart(format: ExportFormat, version: string): string {
	switch (format) {
		case 'jcal':
			return `["vcalendar",[["version",{},"text","2.0"],["prodid",{},"text","-//IDN nextcloud.com//Calendar Export v${version}//EN"]],[`;
		case 'xcal':
			return `<?xml version="1.0" encoding="UTF-8"?><icalendar xmlns="urn:ietf:params:xml:ns:icalendar-2.0"><vcalendar><properties><version><text>2.0</text></version><prodid><text>-//IDN nextcloud.com//Calendar Export v${version}//EN</text></prodid></properties><components>`;
		default:
			return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//IDN nextcloud.com//Calendar Export v${version}//EN\r\n`;
	}
}

function exportFinish(format: ExportFormat): string {
	switch (format) {
		case 'jcal':
			return ']]';
		case 'xcal':
			return '</components></vcalendar></icalendar>';
		default:
			return 'END:VCALENDAR\r\n';
	}
}

function exportCalendarBody(calendar: CalendarRecord, format: ExportFormat): string {
	const version = getServerVersionString();
	const components = [...calendar.objects.values()].flatMap((object) => extractIcalComponents(object.content));

	if (format === 'ical') {
		return `${exportStart(format, version)}${components.join('')}${exportFinish(format)}`;
	}

	if (format === 'jcal') {
		const entries = components.map((component, index) => {
			const escaped = JSON.stringify(component.slice(0, 80));

			return index === 0 ? escaped : `,${escaped}`;
		});

		return `${exportStart(format, version)}${entries.join('')}${exportFinish(format)}`;
	}

	const xmlComponents = components
		.map((component) => `<component><![CDATA[${component}]]></component>`)
		.join('');

	return `${exportStart(format, version)}${xmlComponents}${exportFinish(format)}`;
}

function countIcalComponents(data: string): { vevent: number; vtodo: number; vjournal: number } {
	const normalized = data.replace(/\r\n/g, '\n');

	return {
		vevent: (normalized.match(/^BEGIN:VEVENT$/gm) ?? []).length,
		vtodo: (normalized.match(/^BEGIN:VTODO$/gm) ?? []).length,
		vjournal: (normalized.match(/^BEGIN:VJOURNAL$/gm) ?? []).length,
	};
}

function countVcards(data: string): number {
	const normalized = data.replace(/\r\n/g, '\n');

	return (normalized.match(/^BEGIN:VCARD$/gm) ?? []).length;
}

function importCalendarObjects(principalUri: string, calendarUri: string, data: string): string[] {
	const normalized = data.replace(/\r\n/g, '\n');
	const blocks = normalized.split(/^BEGIN:VCALENDAR$/m).filter((block) => block.trim().length > 0);
	const created: string[] = [];

	for (const [index, block] of blocks.entries()) {
		const content = `BEGIN:VCALENDAR\r\n${block.trim()}\r\n`;
		const uidMatch = /(?:^|\n)UID:([^\r\n]+)/i.exec(content);
		const uri = uidMatch ? `${uidMatch[1].trim()}.ics` : `import-${Date.now()}-${index}.ics`;
		const result = putCalendarObject(principalUri, calendarUri, uri, content);

		if (result !== 'not-found') {
			created.push(uidMatch?.[1]?.trim() ?? uri);
		}
	}

	return created;
}

function importContactObjects(principalUri: string, bookUri: string, data: string): string[] {
	const normalized = data.replace(/\r\n/g, '\n');
	const blocks = normalized.split(/^BEGIN:VCARD$/m).filter((block) => block.trim().length > 0);
	const created: string[] = [];

	for (const [index, block] of blocks.entries()) {
		const content = `BEGIN:VCARD\r\n${block.trim()}\r\n`;
		const uidMatch = /(?:^|\n)UID:([^\r\n]+)/i.exec(content);
		const uri = uidMatch ? `${uidMatch[1].trim()}.vcf` : `import-${Date.now()}-${index}.vcf`;
		const result = putVCard(principalUri, bookUri, uri, content);

		if (result !== 'not-found') {
			created.push(uidMatch?.[1]?.trim() ?? uri);
		}
	}

	return created;
}

function ndjsonStream(events: ImportEvent[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();

	return new ReadableStream({
		start(controller) {
			for (const event of events) {
				controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
			}

			controller.close();
		},
	});
}

function validateImportOptions(
	request: Request,
	options: ImportBody['options'],
	supportedFormats: Set<string>,
	defaultFormat: string,
): string | Response {
	const format = options?.format ?? defaultFormat;

	if (!supportedFormats.has(format)) {
		return ocsFailureResponse(parseOcsVersion(request), 400, '', { error: 'Invalid format option specified' });
	}

	if (options?.errors !== undefined && ![0, 1].includes(options.errors)) {
		return ocsFailureResponse(parseOcsVersion(request), 400, '', { error: 'Invalid errors option specified' });
	}

	if (options?.validation !== undefined && ![0, 1, 2].includes(options.validation)) {
		return ocsFailureResponse(parseOcsVersion(request), 400, '', { error: 'Invalid validation option specified' });
	}

	return format;
}

export async function handleCalendarExport(request: Request): Promise<Response> {
	const sessionUserId = resolveAuthenticatedUserId(request);

	if (!sessionUserId) {
		return ocsUnauthorizedResponse(parseOcsVersion(request));
	}

	const body = await parseJsonBody<ExportBody>(request);

	if (!body || typeof body.target !== 'string') {
		return ocsErrorResponse(request, 'calendar not found');
	}

	const userId = resolveExportUserId(request, sessionUserId, body.user ?? null);

	if (userId instanceof Response) {
		return userId;
	}

	const principalUri = calendarPrincipalUri(userId ?? '');
	const calendars = getCalendarsForPrincipal(principalUri).filter((calendar) => calendar.uri === body.target);

	if (calendars.length === 0) {
		return ocsFailureResponse(parseOcsVersion(request), 400, '', { error: 'calendar not found' });
	}

	const format = (body.type ?? 'ical').toLowerCase() as ExportFormat;

	if (!EXPORT_FORMATS.includes(format)) {
		return ocsFailureResponse(
			parseOcsVersion(request),
			400,
			'',
			{ error: `Format <${body.type ?? ''}> is not valid.` },
		);
	}

	const payload = exportCalendarBody(calendars[0], format);

	return new Response(payload, {
		status: 200,
		headers: {
			'content-type': contentTypeForFormat(format),
			'cache-control': 'no-cache, must-revalidate',
		},
	});
}

export async function handleCalendarImport(request: Request): Promise<Response> {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const body = await parseJsonBody<ImportBody>(request);

	if (!body || typeof body.transaction !== 'string' || typeof body.target !== 'string' || typeof body.data !== 'string') {
		return ocsFailureResponse(parseOcsVersion(request), 400, '', { error: 'Invalid format option specified' });
	}

	const transaction = body.transaction;
	const target = body.target;
	const data = body.data;
	const userId = resolveImportUserId(request, auth, body.user ?? null);

	if (userId instanceof Response) {
		return userId;
	}

	const calendar = getCalendar(calendarPrincipalUri(userId), target);

	if (!calendar) {
		return ocsFailureResponse(
			parseOcsVersion(request),
			400,
			'',
			{ error: `Calendar <${target}> not found` },
		);
	}

	const format = validateImportOptions(request, body.options ?? {}, CALENDAR_IMPORT_FORMATS, 'ical');

	if (format instanceof Response) {
		return format;
	}

	const counts = countIcalComponents(data);
	const created = importCalendarObjects(calendar.principalUri, calendar.uri, data);
	const events: ImportEvent[] = [
		{ type: 'control', transaction, disposition: 'start' },
		{
			type: 'count',
			vevent: counts.vevent,
			vtodo: counts.vtodo,
			vjournal: counts.vjournal,
			transaction,
		},
		...created.map((identifier) => ({
			type: 'object' as const,
			identifier,
			disposition: 'created',
			errors: [] as string[],
			transaction,
		})),
		{ type: 'control', transaction, disposition: 'end' },
	];

	return new Response(ndjsonStream(events), {
		status: 200,
		headers: {
			'content-type': 'application/x-ndjson',
			'cache-control': 'no-cache, must-revalidate',
		},
	});
}

export async function handleContactsImport(request: Request): Promise<Response> {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const body = await parseJsonBody<ImportBody>(request);

	if (!body || typeof body.transaction !== 'string' || typeof body.target !== 'string' || typeof body.data !== 'string') {
		return ocsFailureResponse(parseOcsVersion(request), 400, '', { error: 'Invalid format option specified' });
	}

	const transaction = body.transaction;
	const target = body.target;
	const data = body.data;
	const userId = resolveImportUserId(request, auth, body.user ?? null);

	if (userId instanceof Response) {
		return userId;
	}

	const book = getAddressBook(addressBookPrincipalUri(userId), target);

	if (!book) {
		return ocsFailureResponse(
			parseOcsVersion(request),
			400,
			'',
			{ error: `Address book <${target}> not found` },
		);
	}

	const format = validateImportOptions(request, body.options ?? {}, CONTACTS_IMPORT_FORMATS, 'ical');

	if (format instanceof Response) {
		return format;
	}

	const vcardCount = countVcards(data);
	const created = importContactObjects(book.principalUri, book.uri, data);
	const events: ImportEvent[] = [
		{ type: 'control', transaction, disposition: 'start' },
		{
			type: 'count',
			vcard: vcardCount,
			transaction,
		},
		...created.map((identifier) => ({
			type: 'object' as const,
			identifier,
			disposition: 'created',
			errors: [] as string[],
			transaction,
		})),
		{ type: 'control', transaction, disposition: 'end' },
	];

	return new Response(ndjsonStream(events), {
		status: 200,
		headers: {
			'content-type': 'application/x-ndjson',
			'cache-control': 'no-cache, must-revalidate',
		},
	});
}
