import { davUnauthorizedResponse, resolveDavUserId } from './auth-basic';
import { collectPropfindResponses, parseDepthHeader, resolveDavResource } from './files';
import { parseDavRequest } from './remote';
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

function handleOptions(): Response {
	return new Response(null, {
		status: 200,
		headers: {
			allow: 'OPTIONS, GET, HEAD, PUT, DELETE, PROPFIND, PROPPATCH, MKCOL, COPY, MOVE',
			dav: '1, 3, extended-mkcol',
			'content-length': '0',
		},
	});
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

function handlePropfind(request: Request, parsed: ReturnType<typeof parseDavRequest>, resolveUser: ResolveUser): Response {
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
		const userId = resolveUser(request);

		if (!userId) {
			return davUnauthorizedResponse();
		}

		return handleOptions();
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
