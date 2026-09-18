import { resolveLegacyCalDavUserId } from './auth-legacy-caldav';
import { resolveLegacyCardDavUserId } from './auth-legacy-carddav';
import { davUnauthorizedResponse, resolveDavUserId } from './auth-basic';
import {
	addressBookForbiddenResponse,
	addressBookMethodNotAllowedResponse,
	addressBookNotFoundResponse,
	buildAddressBookPropfindBody,
	handleAddressBookGet,
	handleAddressBookPut,
	isAddressBookDavPath,
	parseAddressBookDepth,
	parseAddressBookPath,
} from './addressbooks';
import {
	buildCalendarPropfindBody,
	calendarMethodNotAllowedResponse,
	calendarNotFoundResponse,
	calendarWriteForbiddenResponse,
	handleCalendarGet,
	handleCalendarMkcalendar,
	handleCalendarPut,
	handleCalendarReport,
	isCalendarDavPath,
	isPublicCalendarDavPath,
	parseCalendarDepth,
	parseCalendarPath,
	parseMkcalendarDisplayName,
} from './calendars';
import { collectPropfindResponses, parseDepthHeader, resolveDavResource } from './files';
import {
	buildPrincipalPropfindBody,
	isPrincipalPath,
	isPublicPrincipalPath,
	parsePrincipalDepth,
	parsePrincipalPath,
} from './principals';
import { isLegacyCalDavIngress, isLegacyCardDavIngress, parseDavRequest } from './remote';
import type { DavIngress } from './types';
import {
	assertUploadAccess,
	buildUploadPropfindBody,
	collectUploadPropfindResponses,
	createUploadFolder,
	isUploadPath,
	moveUploadFutureFile,
	parseDavDestinationHeader,
	parseUploadRequest,
	putUploadChunk,
	getAssembledUploadSize,
} from './uploads';
import {
	buildBadRequestXml,
	buildForbiddenXml,
	buildMethodNotAllowedXml,
	buildNotFoundXml,
	buildPropfindMultistatus,
} from './xml';

const PROPFIND_BODY = `<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:allprop/></d:propfind>`;

type ResolveUser = (request: Request) => string | null;

function resolveUserForIngress(request: Request, ingress: DavIngress, resolveUser: ResolveUser): string | null {
	if (isLegacyCalDavIngress(ingress)) {
		return resolveLegacyCalDavUserId(request);
	}

	if (isLegacyCardDavIngress(ingress)) {
		return resolveLegacyCardDavUserId(request);
	}

	return resolveUser(request);
}

function xmlResponse(body: string, status: number, extraHeaders: Record<string, string> = {}): Response {
	return new Response(body, {
		status,
		headers: {
			'content-type': 'application/xml; charset=utf-8',
			...extraHeaders,
		},
	});
}

function emptyResponse(status: number, extraHeaders: Record<string, string> = {}): Response {
	return new Response(null, {
		status,
		headers: {
			'content-length': '0',
			...extraHeaders,
		},
	});
}

function handleOptions(options: { isPublicCalendar?: boolean; isAddressBook?: boolean } = {}): Response {
	const { isPublicCalendar = false, isAddressBook = false } = options;

	return new Response(null, {
		status: 200,
		headers: {
			allow: isPublicCalendar
				? 'OPTIONS, GET, HEAD, PROPFIND, REPORT'
				: 'OPTIONS, GET, HEAD, PUT, DELETE, PROPFIND, PROPPATCH, MKCOL, MKCALENDAR, COPY, MOVE, REPORT',
			dav: isAddressBook
				? '1, 3, extended-mkcol, addressbook'
				: '1, 3, extended-mkcol, calendar-access',
			'content-length': '0',
		},
	});
}

async function handleAddressBookRequest(
	request: Request,
	parsed: ReturnType<typeof parseDavRequest>,
	resolveUser: ResolveUser,
): Promise<Response> {
	const addressBookPath = parseAddressBookPath(parsed!);

	if (!addressBookPath) {
		return addressBookNotFoundResponse();
	}

	const method = request.method.toUpperCase();
	const userId = resolveUserForIngress(request, parsed!.ingress, resolveUser);

	if (!userId) {
		return davUnauthorizedResponse();
	}

	if (method === 'OPTIONS') {
		return handleOptions({ isAddressBook: true });
	}

	if (method === 'PROPFIND') {
		return handleAddressBookPropfind(request, parsed, userId);
	}

	if (method === 'GET' || method === 'HEAD') {
		const result = handleAddressBookGet(addressBookPath, userId);

		if (result === 'not-found') {
			return addressBookNotFoundResponse();
		}

		if (result === 'forbidden') {
			return addressBookForbiddenResponse();
		}

		if (method === 'HEAD') {
			return new Response(null, {
				status: result.status,
				headers: result.headers,
			});
		}

		return result;
	}

	if (method === 'PUT') {
		const result = await handleAddressBookPut(request, addressBookPath, userId);

		if (result === 'not-found') {
			return addressBookNotFoundResponse();
		}

		if (result === 'forbidden') {
			return addressBookForbiddenResponse();
		}

		return result;
	}

	if (method === 'DELETE' || method === 'MKCOL' || method === 'COPY' || method === 'MOVE' || method === 'REPORT') {
		return addressBookForbiddenResponse();
	}

	return addressBookMethodNotAllowedResponse('Method not allowed');
}

async function handleCalendarRequest(
	request: Request,
	parsed: ReturnType<typeof parseDavRequest>,
	resolveUser: ResolveUser,
): Promise<Response> {
	const calendarPath = parseCalendarPath(parsed!);

	if (!calendarPath) {
		return calendarNotFoundResponse();
	}

	const method = request.method.toUpperCase();
	const isPublic = isPublicCalendarDavPath(parsed!.davPath);
	const userId = isPublic ? null : resolveUserForIngress(request, parsed!.ingress, resolveUser);

	if (!isPublic && !userId) {
		return davUnauthorizedResponse();
	}

	if (method === 'OPTIONS') {
		return handleOptions({ isPublicCalendar: isPublic });
	}

	if (method === 'PROPFIND') {
		return handleCalendarPropfind(request, parsed, userId);
	}

	if (method === 'GET' || method === 'HEAD') {
		const result = handleCalendarGet(calendarPath, userId);

		if (result === 'not-found') {
			return calendarNotFoundResponse();
		}

		if (result === 'forbidden') {
			return calendarWriteForbiddenResponse();
		}

		if (method === 'HEAD') {
			return new Response(null, {
				status: result.status,
				headers: result.headers,
			});
		}

		return result;
	}

	if (method === 'MKCALENDAR') {
		if (isPublic) {
			return calendarWriteForbiddenResponse();
		}

		const body = await request.text();
		const result = handleCalendarMkcalendar(calendarPath, userId!, parseMkcalendarDisplayName(body));

		if (result === 'not-found') {
			return calendarNotFoundResponse();
		}

		if (result === 'forbidden') {
			return calendarWriteForbiddenResponse();
		}

		if (result === 'method-not-allowed') {
			return calendarMethodNotAllowedResponse('The resource you tried to create has a reserved name');
		}

		return result;
	}

	if (method === 'PUT') {
		if (isPublic) {
			return calendarWriteForbiddenResponse();
		}

		const result = await handleCalendarPut(request, calendarPath, userId!);

		if (result === 'not-found') {
			return calendarNotFoundResponse();
		}

		if (result === 'forbidden') {
			return calendarWriteForbiddenResponse();
		}

		return result;
	}

	if (method === 'REPORT') {
		const result = handleCalendarReport(calendarPath, userId);

		if (result === 'not-found') {
			return calendarNotFoundResponse();
		}

		if (result === 'forbidden') {
			return calendarWriteForbiddenResponse();
		}

		return result;
	}

	if (isPublic || method === 'DELETE' || method === 'MKCOL' || method === 'COPY' || method === 'MOVE') {
		return calendarWriteForbiddenResponse();
	}

	return calendarMethodNotAllowedResponse('Method not allowed');
}

function handlePrincipalPropfind(
	request: Request,
	parsed: ReturnType<typeof parseDavRequest>,
	userId: string | null,
): Response {
	const principalPath = parsePrincipalPath(parsed!);

	if (!principalPath) {
		return xmlResponse(buildNotFoundXml('File not found'), 404);
	}

	const depth = parsePrincipalDepth(request);
	const body = buildPrincipalPropfindBody(principalPath, depth);

	if (body === 'not-found') {
		return xmlResponse(buildNotFoundXml('Principal with name ' + (principalPath.principalId ?? '') + ' was not found'), 404);
	}

	return xmlResponse(body, 207, userId ? { 'x-user-id': userId } : {});
}

function handleFilesPropfind(request: Request, parsed: ReturnType<typeof parseDavRequest>, userId: string): Response {
	const resolved = resolveDavResource(parsed!, userId);

	if (resolved === 'unsupported') {
		return xmlResponse(buildNotFoundXml('File not found'), 404);
	}

	if (resolved === 'not-found') {
		return xmlResponse(buildNotFoundXml('File not found'), 404);
	}

	const depthHeader = request.headers.get('depth') ?? request.headers.get('Depth');
	const depth = parseDepthHeader(depthHeader);
	const effectiveDepth = Number.isFinite(depth) && depth > 1 ? 1 : depth;
	const responses = collectPropfindResponses(resolved, effectiveDepth);
	const body = buildPropfindMultistatus(responses.map((entry) => ({
		href: entry.href,
		isCollection: entry.node.kind === 'directory',
		displayName: entry.node.name,
		etag: entry.node.etag,
		fileId: entry.node.fileId,
		size: entry.node.size,
		permissions: entry.permissions,
	})));

	return xmlResponse(body, 207, {
		'x-user-id': userId,
	});
}

function handleUploadPropfind(request: Request, parsed: ReturnType<typeof parseDavRequest>, userId: string): Response {
	const upload = parseUploadRequest(parsed!);

	if (!upload) {
		return xmlResponse(buildNotFoundXml('File not found'), 404);
	}

	if (assertUploadAccess(userId, upload.userId) === 'forbidden') {
		return xmlResponse(buildForbiddenXml('Not allowed'), 403);
	}

	const depthHeader = request.headers.get('depth') ?? request.headers.get('Depth');
	const depth = parseDepthHeader(depthHeader);
	const effectiveDepth = Number.isFinite(depth) && depth > 1 ? 1 : depth;
	const responses = collectUploadPropfindResponses(upload, effectiveDepth);

	if (responses === 'not-found') {
		return xmlResponse(buildNotFoundXml('File not found'), 404);
	}

	const body = buildUploadPropfindBody(upload, effectiveDepth);

	return xmlResponse(body, 207, {
		'x-user-id': userId,
	});
}

function handleAddressBookPropfind(
	request: Request,
	parsed: ReturnType<typeof parseDavRequest>,
	userId: string,
): Response {
	const addressBookPath = parseAddressBookPath(parsed!);

	if (!addressBookPath) {
		return addressBookNotFoundResponse();
	}

	const depth = parseAddressBookDepth(request);
	const body = buildAddressBookPropfindBody(addressBookPath, depth, userId);

	if (body === 'not-found') {
		return addressBookNotFoundResponse();
	}

	if (body === 'forbidden') {
		return addressBookForbiddenResponse();
	}

	return xmlResponse(body, 207, { 'x-user-id': userId });
}

function handleCalendarPropfind(
	request: Request,
	parsed: ReturnType<typeof parseDavRequest>,
	userId: string | null,
): Response {
	const calendarPath = parseCalendarPath(parsed!);

	if (!calendarPath) {
		return calendarNotFoundResponse();
	}

	const depth = parseCalendarDepth(request);
	const body = buildCalendarPropfindBody(calendarPath, depth, userId);

	if (body === 'not-found') {
		return calendarNotFoundResponse();
	}

	if (body === 'forbidden') {
		return calendarWriteForbiddenResponse();
	}

	return xmlResponse(body, 207, userId ? { 'x-user-id': userId } : {});
}

function handlePropfind(request: Request, parsed: ReturnType<typeof parseDavRequest>, resolveUser: ResolveUser): Response {
	if (parsed!.ingress === 'v2' && isPublicCalendarDavPath(parsed!.davPath)) {
		return handleCalendarPropfind(request, parsed, null);
	}

	if (parsed!.ingress === 'v2' && isCalendarDavPath(parsed!)) {
		const userId = resolveUser(request);

		if (!userId) {
			return davUnauthorizedResponse();
		}

		return handleCalendarPropfind(request, parsed, userId);
	}

	if (parsed!.ingress === 'v2' && isAddressBookDavPath(parsed!.davPath)) {
		const userId = resolveUser(request);

		if (!userId) {
			return davUnauthorizedResponse();
		}

		return handleAddressBookPropfind(request, parsed, userId);
	}

	if (parsed!.ingress === 'v2' && isPrincipalPath(parsed!)) {
		if (isPublicPrincipalPath(parsed!.davPath)) {
			return handlePrincipalPropfind(request, parsed, null);
		}

		const userId = resolveUser(request);

		if (!userId) {
			return davUnauthorizedResponse();
		}

		return handlePrincipalPropfind(request, parsed, userId);
	}

	const userId = resolveUser(request);

	if (!userId) {
		return davUnauthorizedResponse();
	}

	if (isUploadPath(parsed!) && parsed!.ingress === 'v2') {
		return handleUploadPropfind(request, parsed, userId);
	}

	return handleFilesPropfind(request, parsed, userId);
}

function handleUploadMkcol(parsed: ReturnType<typeof parseDavRequest>, userId: string): Response {
	const upload = parseUploadRequest(parsed!);

	if (!upload?.folderName || upload.chunkName) {
		return xmlResponse(buildBadRequestXml('Invalid MKCOL target'), 400);
	}

	if (assertUploadAccess(userId, upload.userId) === 'forbidden') {
		return xmlResponse(buildForbiddenXml('Not allowed'), 403);
	}

	const result = createUploadFolder(upload.userId, upload.folderName);

	if (result === 'conflict') {
		return xmlResponse(buildNotFoundXml('Could not create directory'), 409);
	}

	return emptyResponse(201, {
		'x-user-id': userId,
	});
}

async function handleUploadPut(request: Request, parsed: ReturnType<typeof parseDavRequest>, userId: string): Promise<Response> {
	const upload = parseUploadRequest(parsed!);

	if (!upload?.folderName || !upload.chunkName) {
		return xmlResponse(buildNotFoundXml('File not found'), 404);
	}

	if (assertUploadAccess(userId, upload.userId) === 'forbidden') {
		return xmlResponse(buildForbiddenXml('Not allowed'), 403);
	}

	const body = Buffer.from(await request.arrayBuffer());
	const result = putUploadChunk(upload.userId, upload.folderName, upload.chunkName, body);

	if (result === 'invalid-chunk') {
		return xmlResponse(buildMethodNotAllowedXml('Reading intermediate uploads is not allowed'), 405);
	}

	if (result === 'not-found') {
		return xmlResponse(buildNotFoundXml('File not found'), 404);
	}

	return emptyResponse(201, {
		'x-user-id': userId,
		'x-nc-ownerid': userId,
	});
}

function handleUploadMove(request: Request, parsed: ReturnType<typeof parseDavRequest>, userId: string): Response {
	const upload = parseUploadRequest(parsed!);

	if (!upload?.folderName || upload.chunkName !== '.file') {
		return xmlResponse(buildMethodNotAllowedXml('Intermediate uploads must be finalized using MOVE'), 405);
	}

	if (assertUploadAccess(userId, upload.userId) === 'forbidden') {
		return xmlResponse(buildForbiddenXml('Not allowed'), 403);
	}

	const destinationHeader = request.headers.get('destination') ?? request.headers.get('Destination');
	const destinationPath = parseDavDestinationHeader(destinationHeader, new URL(request.url).origin);

	if (!destinationPath) {
		return xmlResponse(buildBadRequestXml('Destination header was not supplied'), 400);
	}

	const expectedTotalLength = request.headers.get('oc-total-length') ?? request.headers.get('OC-Total-Length');
	const result = moveUploadFutureFile(upload.userId, upload.folderName, destinationPath, expectedTotalLength);

	if (result === 'not-found') {
		return xmlResponse(buildNotFoundXml('File not found'), 404);
	}

	if (result === 'bad-destination') {
		return xmlResponse(buildBadRequestXml(`The given destination ${destinationPath} is a directory.`), 400);
	}

	if (result === 'size-mismatch') {
		const actualSize = getAssembledUploadSize(upload.userId, upload.folderName) ?? 0;

		return xmlResponse(
			buildBadRequestXml(`Chunks on server do not sum up to ${expectedTotalLength} but to ${actualSize} bytes`),
			400,
		);
	}

	return emptyResponse(result === 'created' ? 201 : 204, {
		'x-user-id': userId,
	});
}

export async function handleDavRequest(
	request: Request,
	resolveUser: ResolveUser = resolveDavUserId,
): Promise<Response> {
	const parsed = parseDavRequest(new URL(request.url));

	if (!parsed) {
		return new Response(null, { status: 404 });
	}

	const method = request.method.toUpperCase();

	if (method === 'OPTIONS') {
		if (parsed.ingress === 'v2' && isPublicCalendarDavPath(parsed.davPath)) {
			return handleOptions({ isPublicCalendar: true });
		}

		if (parsed.ingress === 'v2' && isAddressBookDavPath(parsed.davPath)) {
			const userId = resolveUser(request);

			if (!userId) {
				return davUnauthorizedResponse();
			}

			return handleOptions({ isAddressBook: true });
		}

		if (parsed.ingress === 'v2' && isPublicPrincipalPath(parsed.davPath)) {
			return handleOptions();
		}

		const userId = resolveUserForIngress(request, parsed.ingress, resolveUser);

		if (!userId) {
			return davUnauthorizedResponse();
		}

		return handleOptions();
	}

	if (isLegacyCalDavIngress(parsed.ingress)) {
		return handleCalendarRequest(request, parsed, resolveUser);
	}

	if (isLegacyCardDavIngress(parsed.ingress)) {
		return handleAddressBookRequest(request, parsed, resolveUser);
	}

	if (parsed.ingress === 'v2' && isCalendarDavPath(parsed)) {
		return handleCalendarRequest(request, parsed, resolveUser);
	}

	if (parsed.ingress === 'v2' && isAddressBookDavPath(parsed.davPath)) {
		return handleAddressBookRequest(request, parsed, resolveUser);
	}

	if (method === 'PROPFIND') {
		return handlePropfind(request, parsed, resolveUser);
	}

	if (parsed.ingress === 'v2' && isUploadPath(parsed)) {
		const userId = resolveUser(request);

		if (!userId) {
			return davUnauthorizedResponse();
		}

		if (method === 'MKCOL') {
			return handleUploadMkcol(parsed, userId);
		}

		if (method === 'PUT') {
			return handleUploadPut(request, parsed, userId);
		}

		if (method === 'MOVE') {
			return handleUploadMove(request, parsed, userId);
		}
	}

	return xmlResponse(buildNotFoundXml('Method not allowed'), 405);
}

export function defaultPropfindBody(): string {
	return PROPFIND_BODY;
}
