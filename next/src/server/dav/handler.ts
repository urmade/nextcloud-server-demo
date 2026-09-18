import { davUnauthorizedResponse, resolveDavUserId } from './auth-basic';
import { collectPropfindResponses, parseDepthHeader, resolveDavResource } from './files';
import { parseDavRequest } from './remote';
import { buildNotFoundXml, buildPropfindMultistatus } from './xml';

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

function handlePropfind(request: Request, parsed: ReturnType<typeof parseDavRequest>, resolveUser: ResolveUser): Response {
	const userId = resolveUser(request);

	if (!userId) {
		return davUnauthorizedResponse();
	}

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

	return xmlResponse(buildNotFoundXml('Method not allowed'), 405);
}

export function defaultPropfindBody(): string {
	return PROPFIND_BODY;
}
