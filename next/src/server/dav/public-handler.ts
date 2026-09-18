import { parseDepthHeader } from './files';
import {
	authenticatePublicDav,
	isAjaxRequest,
	isMethodGateBlocked,
} from './public-auth';
import {
	canReadShare,
	collectPublicPropfindResponses,
	putFileInShare,
	resolvePublicDavResource,
} from './public-files';
import { extractV2RelativeSegments, parsePublicDavRequest, type ParsedPublicDavRequest } from './public-remote';
import {
	buildForbiddenXml,
	buildNotFoundXml,
	buildPropfindMultistatus,
} from './xml';

const PROPFIND_BODY = `<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:allprop/></d:propfind>`;

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
			'content-security-policy': "default-src 'none'",
		},
	});
}

function handlePropfind(
	request: Request,
	parsed: ParsedPublicDavRequest,
	auth: ReturnType<typeof authenticatePublicDav>,
): Response {
	if (auth instanceof Response) {
		return auth;
	}

	if (!canReadShare(auth.share)) {
		return xmlResponse(buildForbiddenXml('Forbidden'), 403);
	}

	const resolved = resolvePublicDavResource(parsed, auth.share, auth.token);

	if (resolved === 'unsupported' || resolved === 'not-found') {
		return xmlResponse(buildNotFoundXml('File not found'), 404);
	}

	const depthHeader = request.headers.get('depth') ?? request.headers.get('Depth');
	const depth = parseDepthHeader(depthHeader);
	const effectiveDepth = Number.isFinite(depth) && depth > 1 ? 1 : depth;
	const responses = collectPublicPropfindResponses(resolved, effectiveDepth);
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
		'content-security-policy': "default-src 'none'",
	});
}

function handleGet(
	parsed: ParsedPublicDavRequest,
	auth: ReturnType<typeof authenticatePublicDav>,
): Response {
	if (auth instanceof Response) {
		return auth;
	}

	if (!canReadShare(auth.share)) {
		return xmlResponse(buildForbiddenXml('Forbidden'), 403);
	}

	const resolved = resolvePublicDavResource(parsed, auth.share, auth.token);

	if (resolved === 'unsupported' || resolved === 'not-found') {
		return xmlResponse(buildNotFoundXml('File not found'), 404);
	}

	if (resolved.node.kind !== 'file') {
		return xmlResponse(buildNotFoundXml('File not found'), 404);
	}

	const body = resolved.node.content ?? '';

	return new Response(body, {
		status: 200,
		headers: {
			'content-type': resolved.node.contentType,
			'content-length': String(resolved.node.size),
			etag: resolved.node.etag,
			'content-security-policy': "default-src 'none'",
		},
	});
}

async function handlePut(
	request: Request,
	parsed: ParsedPublicDavRequest,
	auth: ReturnType<typeof authenticatePublicDav>,
): Promise<Response> {
	if (auth instanceof Response) {
		return auth;
	}

	const relativeSegments = parsed.ingress === 'v2'
		? extractV2RelativeSegments(parsed.davPath)
		: parsed.davPath.split('/').filter(Boolean);

	if (relativeSegments.length === 0) {
		return xmlResponse(buildNotFoundXml('File not found'), 404);
	}

	const content = Buffer.from(await request.arrayBuffer());
	const result = putFileInShare(auth.share, relativeSegments, content);

	if (result === 'forbidden') {
		return xmlResponse(buildForbiddenXml('Forbidden'), 403);
	}

	if (result === 'not-found') {
		return xmlResponse(buildNotFoundXml('File not found'), 404);
	}

	return emptyResponse(result === 'created' ? 201 : 204, {
		'content-security-policy': "default-src 'none'",
	});
}

export async function handlePublicDavRequest(request: Request): Promise<Response> {
	const parsed = parsePublicDavRequest(new URL(request.url));

	if (!parsed) {
		return new Response(null, { status: 404 });
	}

	const method = request.method.toUpperCase();

	if (method === 'OPTIONS') {
		if (isMethodGateBlocked(method, parsed.ingress, isAjaxRequest(request))) {
			return authenticatePublicDav(request, parsed) as Response;
		}

		return handleOptions();
	}

	const auth = authenticatePublicDav(request, parsed);

	if (method === 'PROPFIND') {
		return handlePropfind(request, parsed, auth);
	}

	if (method === 'GET' || method === 'HEAD') {
		const response = handleGet(parsed, auth);

		if (method === 'HEAD' && response.status === 200) {
			const headers = new Headers(response.headers);
			headers.delete('content-length');

			return new Response(null, {
				status: 200,
				headers,
			});
		}

		return response;
	}

	if (method === 'PUT') {
		return handlePut(request, parsed, auth);
	}

	if (auth instanceof Response) {
		return auth;
	}

	return xmlResponse(buildNotFoundXml('Method not allowed'), 405);
}

export function defaultPublicPropfindBody(): string {
	return PROPFIND_BODY;
}
