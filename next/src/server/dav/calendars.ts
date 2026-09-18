import { parseDepthHeader } from './files';
import {
	createCalendar,
	doesViolateReservedCalendarName,
	getCalendar,
	getCalendarObject,
	getCalendarsForPrincipal,
	getPublicCalendarRecord,
	isPublicCalendarVisible,
	principalUriForUser,
	putCalendarObject,
	resolveRemotePrincipalUri,
	resolveSystemResourcePrincipalUri,
	resolveSystemRoomPrincipalUri,
	userExists,
	type CalendarObjectRecord,
	type CalendarRecord,
} from './calendars-store';
import { buildDavHref, isCalendarDavPath as isCalendarDavPathFromRemote, isPublicCalendarDavPath } from './remote';
import type { ParsedDavRequest } from './types';
import {
	buildCalendarPropfindMultistatus,
	buildCalendarReportMultistatus,
	buildForbiddenXml,
	buildMethodNotAllowedXml,
	buildNotFoundXml,
} from './xml';

export type CalendarTreeKind =
	| 'user-calendars'
	| 'public-calendars'
	| 'remote-calendars'
	| 'system-resources'
	| 'system-rooms';

export interface ParsedCalendarPath {
	kind: CalendarTreeKind;
	requestPath: string;
	userId?: string;
	token?: string;
	cloudId?: string;
	resourceId?: string;
	roomId?: string;
	calendarUri?: string;
	objectUri?: string;
	isHome: boolean;
}

function resolvePrincipalUri(parsed: ParsedCalendarPath): string | null {
	switch (parsed.kind) {
		case 'user-calendars':
			return parsed.userId ? principalUriForUser(parsed.userId) : null;
		case 'remote-calendars':
			return parsed.cloudId ? resolveRemotePrincipalUri(parsed.cloudId) : null;
		case 'system-resources':
			return parsed.resourceId ? resolveSystemResourcePrincipalUri(parsed.resourceId) : null;
		case 'system-rooms':
			return parsed.roomId ? resolveSystemRoomPrincipalUri(parsed.roomId) : null;
		default:
			return null;
	}
}

function splitSegments(path: string): string[] {
	return path.split('/').filter(Boolean);
}

export function isCalendarDavPath(parsed: ParsedDavRequest): boolean {
	return isCalendarDavPathFromRemote(parsed.davPath);
}

export { isPublicCalendarDavPath };

export function parseCalendarPath(parsed: ParsedDavRequest): ParsedCalendarPath | null {
	const segments = splitSegments(parsed.davPath);
	const root = segments[0];

	if (root === 'calendars') {
		const userId = segments[1];

		if (!userId) {
			return null;
		}

		return {
			kind: 'user-calendars',
			userId,
			calendarUri: segments[2],
			objectUri: segments[3],
			isHome: segments.length === 2,
			requestPath: buildDavHref(parsed.requestPath, segments.length <= 2),
		};
	}

	if (root === 'public-calendars') {
		const token = segments[1];

		if (!token) {
			return {
				kind: 'public-calendars',
				isHome: true,
				requestPath: buildDavHref(parsed.requestPath, true),
			};
		}

		return {
			kind: 'public-calendars',
			token,
			calendarUri: segments[2],
			objectUri: segments[3],
			isHome: false,
			requestPath: buildDavHref(parsed.requestPath, !segments[2]?.includes('.')),
		};
	}

	if (root === 'remote-calendars') {
		const cloudId = segments[1];
		const calendarUri = segments[2];

		if (!cloudId) {
			return null;
		}

		return {
			kind: 'remote-calendars',
			cloudId,
			calendarUri,
			objectUri: segments[3],
			isHome: !calendarUri,
			requestPath: buildDavHref(parsed.requestPath, !calendarUri || !objectLooksLikeFile(calendarUri)),
		};
	}

	if (root === 'system-calendars') {
		if (segments[1] === 'calendar-resources') {
			const resourceId = segments[2];

			if (!resourceId) {
				return null;
			}

			return {
				kind: 'system-resources',
				resourceId,
				calendarUri: segments[3],
				objectUri: segments[4],
				isHome: !segments[3],
				requestPath: buildDavHref(parsed.requestPath, !segments[3] || !objectLooksLikeFile(segments[3])),
			};
		}

		if (segments[1] === 'calendar-rooms') {
			const roomId = segments[2];

			if (!roomId) {
				return null;
			}

			return {
				kind: 'system-rooms',
				roomId,
				calendarUri: segments[3],
				objectUri: segments[4],
				isHome: !segments[3],
				requestPath: buildDavHref(parsed.requestPath, !segments[3] || !objectLooksLikeFile(segments[3])),
			};
		}
	}

	return null;
}

export function parseCalendarDepth(request: Request): number {
	const depthHeader = request.headers.get('depth') ?? request.headers.get('Depth');
	const depth = parseDepthHeader(depthHeader);

	if (Number.isFinite(depth) && depth > 1) {
		return 1;
	}

	return depth;
}

function canAccessUserCalendarHome(sessionUserId: string, targetUserId: string): 'own' | 'empty' | 'missing' {
	if (!userExists(targetUserId)) {
		return 'missing';
	}

	if (sessionUserId === targetUserId) {
		return 'own';
	}

	return 'empty';
}

function objectLooksLikeFile(segment: string | undefined): boolean {
	return Boolean(segment?.includes('.'));
}

function resolveWritablePrincipal(parsed: ParsedCalendarPath): string | 'not-found' {
	const principalUri = resolvePrincipalUri(parsed);

	if (!principalUri) {
		return 'not-found';
	}

	if (parsed.kind === 'remote-calendars' || parsed.kind === 'system-resources' || parsed.kind === 'system-rooms') {
		if (!parsed.calendarUri) {
			return 'not-found';
		}

		return principalUri;
	}

	return principalUri;
}

function resolveReadableCalendar(
	parsed: ParsedCalendarPath,
	sessionUserId: string | null,
): { calendar: CalendarRecord; href: string } | 'not-found' | 'forbidden' {
	if (parsed.kind === 'public-calendars') {
		if (!parsed.token) {
			return 'not-found';
		}

		if (!isPublicCalendarVisible(parsed.token)) {
			return 'not-found';
		}

		const published = getPublicCalendarRecord(parsed.token);

		if (!published) {
			return 'not-found';
		}

		return {
			calendar: published.calendar,
			href: buildDavHref(`/remote.php/dav/public-calendars/${parsed.token}/`, true),
		};
	}

	if (parsed.kind === 'user-calendars') {
		const access = canAccessUserCalendarHome(sessionUserId ?? '', parsed.userId ?? '');

		if (access === 'missing') {
			return 'not-found';
		}

		if (parsed.isHome) {
			return 'not-found';
		}

		if (!parsed.calendarUri) {
			return 'not-found';
		}

		const principalUri = resolvePrincipalUri(parsed);

		if (!principalUri) {
			return 'not-found';
		}

		if (access === 'empty') {
			return 'not-found';
		}

		const calendar = getCalendar(principalUri, parsed.calendarUri);

		if (!calendar) {
			return 'not-found';
		}

		return {
			calendar,
			href: buildDavHref(`/remote.php/dav/calendars/${parsed.userId}/${parsed.calendarUri}/`, true),
		};
	}

	if (parsed.kind === 'remote-calendars' || parsed.kind === 'system-resources' || parsed.kind === 'system-rooms') {
		const principalUri = resolvePrincipalUri(parsed);

		if (!principalUri) {
			return 'not-found';
		}

		if (parsed.isHome || !parsed.calendarUri) {
			return 'not-found';
		}

		const calendar = getCalendar(principalUri, parsed.calendarUri);

		if (!calendar) {
			return 'not-found';
		}

		return {
			calendar,
			href: parsed.requestPath.endsWith('/') ? parsed.requestPath : `${parsed.requestPath}/`,
		};
	}

	return 'not-found';
}

function calendarHomeHref(parsed: ParsedCalendarPath): string {
	if (parsed.kind === 'user-calendars') {
		return buildDavHref(`/remote.php/dav/calendars/${parsed.userId}/`, true);
	}

	if (parsed.kind === 'public-calendars' && parsed.token) {
		return buildDavHref(`/remote.php/dav/public-calendars/${parsed.token}/`, true);
	}

	if (parsed.kind === 'remote-calendars') {
		return buildDavHref(`/remote.php/dav/remote-calendars/${parsed.cloudId}/`, true);
	}

	if (parsed.kind === 'system-resources') {
		return buildDavHref(`/remote.php/dav/system-calendars/calendar-resources/${parsed.resourceId}/`, true);
	}

	return buildDavHref(`/remote.php/dav/system-calendars/calendar-rooms/${parsed.roomId}/`, true);
}

function collectHomeCalendars(parsed: ParsedCalendarPath, sessionUserId: string | null): CalendarRecord[] {
	if (parsed.kind === 'public-calendars') {
		return [];
	}

	if (parsed.kind === 'user-calendars') {
		const access = canAccessUserCalendarHome(sessionUserId ?? '', parsed.userId ?? '');

		if (access !== 'own') {
			return [];
		}

		return getCalendarsForPrincipal(resolvePrincipalUri(parsed) ?? '');
	}

	const principalUri = resolvePrincipalUri(parsed);

	if (!principalUri) {
		return [];
	}

	return getCalendarsForPrincipal(principalUri);
}

function calendarToPropfindEntry(calendar: CalendarRecord, href: string, isCollection: boolean) {
	return {
		href,
		displayName: calendar.displayName,
		isCollection,
		isCalendar: isCollection,
		components: calendar.components,
		etag: `"cal-${calendar.id}"`,
		size: 0,
		contentType: isCollection ? undefined : 'text/calendar; charset=utf-8',
	};
}

function objectToPropfindEntry(object: CalendarObjectRecord, href: string) {
	return {
		href,
		displayName: object.uri,
		isCollection: false,
		isCalendar: false,
		etag: object.etag,
		size: object.size,
		contentType: object.contentType,
	};
}

type CalendarPropfindEntry = Parameters<typeof buildCalendarPropfindMultistatus>[0][number];

export function buildCalendarPropfindBody(
	parsed: ParsedCalendarPath,
	depth: number,
	sessionUserId: string | null,
): string | 'not-found' | 'forbidden' {
	if (parsed.kind === 'public-calendars') {
		if (parsed.isHome) {
			return buildCalendarPropfindMultistatus([{
				href: buildDavHref('/remote.php/dav/public-calendars/', true),
				displayName: 'public-calendars',
				isCollection: true,
				isCalendar: false,
			}]);
		}

		if (!parsed.token || !isPublicCalendarVisible(parsed.token)) {
			return 'not-found';
		}

		const published = getPublicCalendarRecord(parsed.token);

		if (!published) {
			return 'not-found';
		}

		const homeHref = calendarHomeHref(parsed);
		const responses: CalendarPropfindEntry[] = [{
			href: homeHref,
			displayName: published.calendar.displayName,
			isCollection: true,
			isCalendar: true,
			components: published.calendar.components,
			etag: `"cal-${published.calendar.id}"`,
			size: 0,
		}];

		if (depth >= 1) {
			for (const object of published.calendar.objects.values()) {
				responses.push(objectToPropfindEntry(object, `${homeHref}${object.uri}`));
			}
		}

		if (parsed.objectUri) {
			const object = published.calendar.objects.get(parsed.objectUri);

			if (!object) {
				return 'not-found';
			}

			return buildCalendarPropfindMultistatus([objectToPropfindEntry(object, parsed.requestPath)]);
		}

		return buildCalendarPropfindMultistatus(responses);
	}

	if (parsed.kind === 'user-calendars') {
		const access = canAccessUserCalendarHome(sessionUserId ?? '', parsed.userId ?? '');

		if (access === 'missing') {
			return 'not-found';
		}

		if (parsed.isHome) {
			const responses = [{
				href: calendarHomeHref(parsed),
				displayName: parsed.userId ?? '',
				isCollection: true,
				isCalendar: false,
			}];

			if (depth >= 1 && access === 'own') {
				const principalUri = resolvePrincipalUri(parsed) ?? '';

				for (const calendar of getCalendarsForPrincipal(principalUri)) {
					responses.push(calendarToPropfindEntry(
						calendar,
						buildDavHref(`/remote.php/dav/calendars/${parsed.userId}/${calendar.uri}/`, true),
						true,
					));
				}
			}

			return buildCalendarPropfindMultistatus(responses);
		}

		const resolved = resolveReadableCalendar(parsed, sessionUserId);

		if (resolved === 'not-found') {
			return 'not-found';
		}

		if (resolved === 'forbidden') {
			return 'forbidden';
		}

		const { calendar, href } = resolved;

		if (parsed.objectUri) {
			const object = calendar.objects.get(parsed.objectUri);

			if (!object) {
				return 'not-found';
			}

			return buildCalendarPropfindMultistatus([objectToPropfindEntry(object, parsed.requestPath)]);
		}

		const responses: CalendarPropfindEntry[] = [calendarToPropfindEntry(calendar, href, true)];

		if (depth >= 1) {
			for (const object of calendar.objects.values()) {
				responses.push(objectToPropfindEntry(object, `${href}${object.uri}`));
			}
		}

		return buildCalendarPropfindMultistatus(responses);
	}

	if (parsed.kind === 'remote-calendars' || parsed.kind === 'system-resources' || parsed.kind === 'system-rooms') {
		const principalUri = resolvePrincipalUri(parsed);

		if (!principalUri) {
			return 'not-found';
		}

		if (parsed.isHome) {
			return buildCalendarPropfindMultistatus([{
				href: calendarHomeHref(parsed),
				displayName: parsed.cloudId ?? parsed.resourceId ?? parsed.roomId ?? '',
				isCollection: true,
				isCalendar: false,
			}]);
		}

		const resolved = resolveReadableCalendar(parsed, sessionUserId);

		if (resolved === 'not-found' || resolved === 'forbidden') {
			return 'not-found';
		}

		const { calendar, href } = resolved;

		if (parsed.objectUri) {
			const object = calendar.objects.get(parsed.objectUri);

			if (!object) {
				return 'not-found';
			}

			return buildCalendarPropfindMultistatus([objectToPropfindEntry(object, parsed.requestPath)]);
		}

		return buildCalendarPropfindMultistatus([calendarToPropfindEntry(calendar, href, true)]);
	}

	return 'not-found';
}

export function handleCalendarMkcalendar(
	parsed: ParsedCalendarPath,
	sessionUserId: string,
	displayName?: string,
): Response | 'not-found' | 'forbidden' | 'method-not-allowed' {
	if (parsed.kind === 'public-calendars') {
		return 'forbidden';
	}

	if (parsed.kind !== 'user-calendars' || parsed.isHome || !parsed.calendarUri || !parsed.userId) {
		return 'not-found';
	}

	if (doesViolateReservedCalendarName(parsed.calendarUri)) {
		return 'method-not-allowed';
	}

	if (sessionUserId !== parsed.userId) {
		return 'forbidden';
	}

	const principalUri = resolvePrincipalUri(parsed);

	if (!principalUri) {
		return 'not-found';
	}

	if (getCalendar(principalUri, parsed.calendarUri)) {
		return 'not-found';
	}

	createCalendar(principalUri, parsed.calendarUri, displayName);

	return new Response(null, {
		status: 201,
		headers: {
			'content-length': '0',
			'x-user-id': parsed.userId,
		},
	});
}

export async function handleCalendarPut(
	request: Request,
	parsed: ParsedCalendarPath,
	sessionUserId: string,
): Promise<Response | 'not-found' | 'forbidden'> {
	if (parsed.kind === 'public-calendars') {
		return 'forbidden';
	}

	if (parsed.kind !== 'user-calendars' || !parsed.calendarUri || !parsed.objectUri || !parsed.userId) {
		return 'not-found';
	}

	if (sessionUserId !== parsed.userId) {
		return 'not-found';
	}

	const principalUri = resolvePrincipalUri(parsed);

	if (!principalUri) {
		return 'not-found';
	}

	let calendar = getCalendar(principalUri, parsed.calendarUri);

	if (!calendar) {
		if (doesViolateReservedCalendarName(parsed.calendarUri)) {
			return 'not-found';
		}

		calendar = createCalendar(principalUri, parsed.calendarUri);
	}

	const content = Buffer.from(await request.arrayBuffer()).toString('utf8');
	const result = putCalendarObject(principalUri, parsed.calendarUri, parsed.objectUri, content);

	if (result === 'not-found') {
		return 'not-found';
	}

	return new Response(null, {
		status: 201,
		headers: {
			'content-length': '0',
			etag: result.etag,
			'x-user-id': sessionUserId,
		},
	});
}

export function handleCalendarGet(
	parsed: ParsedCalendarPath,
	sessionUserId: string | null,
): Response | 'not-found' | 'forbidden' {
	if (!parsed.objectUri) {
		return 'not-found';
	}

	if (parsed.kind === 'public-calendars') {
		if (!parsed.token || !isPublicCalendarVisible(parsed.token)) {
			return 'not-found';
		}

		const published = getPublicCalendarRecord(parsed.token);

		if (!published) {
			return 'not-found';
		}

		const object = published.calendar.objects.get(parsed.objectUri);

		if (!object) {
			return 'not-found';
		}

		return new Response(object.content, {
			status: 200,
			headers: {
				'content-type': object.contentType,
				'content-length': String(object.size),
				etag: object.etag,
			},
		});
	}

	if (parsed.kind === 'user-calendars') {
		if (sessionUserId !== parsed.userId || !parsed.calendarUri) {
			return 'not-found';
		}

		const principalUri = resolvePrincipalUri(parsed);

		if (!principalUri) {
			return 'not-found';
		}

		const object = getCalendarObject(principalUri, parsed.calendarUri, parsed.objectUri);

		if (!object) {
			return 'not-found';
		}

		return new Response(object.content, {
			status: 200,
			headers: {
				'content-type': object.contentType,
				'content-length': String(object.size),
				etag: object.etag,
				'x-user-id': sessionUserId,
			},
		});
	}

	return 'not-found';
}

export function handleCalendarReport(
	parsed: ParsedCalendarPath,
	sessionUserId: string | null,
): Response | 'not-found' | 'forbidden' {
	const resolved = resolveReadableCalendar(parsed, sessionUserId);

	if (resolved === 'not-found') {
		return 'not-found';
	}

	if (resolved === 'forbidden') {
		return 'forbidden';
	}

	const entries = [...resolved.calendar.objects.values()].map((object) => ({
		href: `${resolved.href}${object.uri}`,
		etag: object.etag,
	}));

	return new Response(buildCalendarReportMultistatus(entries), {
		status: 207,
		headers: {
			'content-type': 'application/xml; charset=utf-8',
			...(sessionUserId ? { 'x-user-id': sessionUserId } : {}),
		},
	});
}

export function calendarWriteForbiddenResponse(): Response {
	return new Response(buildForbiddenXml('Permission denied'), {
		status: 403,
		headers: {
			'content-type': 'application/xml; charset=utf-8',
		},
	});
}

export function calendarNotFoundResponse(message = 'File not found'): Response {
	return new Response(buildNotFoundXml(message), {
		status: 404,
		headers: {
			'content-type': 'application/xml; charset=utf-8',
		},
	});
}

export function calendarMethodNotAllowedResponse(message: string): Response {
	return new Response(buildMethodNotAllowedXml(message), {
		status: 405,
		headers: {
			'content-type': 'application/xml; charset=utf-8',
		},
	});
}

export function parseMkcalendarDisplayName(body: string | null): string | undefined {
	if (!body) {
		return undefined;
	}

	const match = /<(?:[\w-]+:)?displayname[^>]*>([^<]*)</i.exec(body);

	return match?.[1]?.trim() || undefined;
}

export function resolveWritablePrincipalUri(parsed: ParsedCalendarPath): string | 'not-found' {
	return resolveWritablePrincipal(parsed);
}
