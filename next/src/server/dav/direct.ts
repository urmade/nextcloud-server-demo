import { findNodeByFileId } from './files';
import { getDirectLinkByToken, mintDirectLink } from './direct-store';
import type { DavFileNode } from './types';
import { buildForbiddenXml, buildNotFoundXml } from './xml';
import { requireAuthenticatedUser } from '@/src/server/ocs/auth';
import {
	ocsFailureResponse,
	ocsForbiddenResponse,
	ocsSuccessResponse,
	parseOcsVersion,
} from '@/src/server/ocs/respond';

const DEFAULT_EXPIRATION_SECONDS = 60 * 60 * 8;
const MAX_EXPIRATION_SECONDS = 60 * 60 * 24;

function shareApiAllowLinks(): boolean {
	const configured = process.env.NC_SHAREAPI_ALLOW_LINKS?.trim().toLowerCase();

	if (configured === 'false' || configured === '0') {
		return false;
	}

	return true;
}

function getRequestOrigin(request: Request): string {
	const forwardedHost = request.headers.get('x-forwarded-host');
	const host = forwardedHost ?? request.headers.get('host') ?? '127.0.0.1:3100';
	const proto = request.headers.get('x-forwarded-proto') ?? 'http';

	return `${proto}://${host}`;
}

function xmlResponse(body: string, status: number): Response {
	return new Response(body, {
		status,
		headers: {
			'content-type': 'application/xml; charset=utf-8',
		},
	});
}

function resolveDirectFile(record: { userId: string; fileId: number }): DavFileNode | 'not-found' | 'forbidden' {
	const node = findNodeByFileId(record.userId, record.fileId);

	if (!node) {
		return 'not-found';
	}

	if (node.kind !== 'file') {
		return 'forbidden';
	}

	return node;
}

function fileResponse(file: DavFileNode): Response {
	const body = file.content ?? '';

	return new Response(body, {
		status: 200,
		headers: {
			'content-type': file.contentType,
			'content-length': String(file.size),
			etag: file.etag,
			'last-modified': new Date(1_694_000_000_000).toUTCString(),
		},
	});
}

export async function handleDirectGetUrl(request: Request): Promise<Response> {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const ocsVersion = parseOcsVersion(request);

	if (!shareApiAllowLinks()) {
		return ocsForbiddenResponse(ocsVersion, 'Creating direct links is disabled');
	}

	const body = await request.json().catch(() => null) as {
		fileId?: number;
		expirationTime?: number;
	} | null;

	if (!body || typeof body.fileId !== 'number') {
		return ocsFailureResponse(
			ocsVersion,
			400,
			'Expiration time should be greater than 0 and less than or equal to 86400',
		);
	}

	const expirationTime = body.expirationTime ?? DEFAULT_EXPIRATION_SECONDS;

	if (expirationTime <= 0 || expirationTime > MAX_EXPIRATION_SECONDS) {
		return ocsFailureResponse(
			ocsVersion,
			400,
			`Expiration time should be greater than 0 and less than or equal to ${MAX_EXPIRATION_SECONDS}`,
		);
	}

	const node = findNodeByFileId(auth, body.fileId);

	if (!node) {
		return ocsFailureResponse(ocsVersion, 404, '');
	}

	if (node.kind !== 'file') {
		return ocsFailureResponse(
			ocsVersion,
			400,
			'Direct download only works for files',
		);
	}

	const record = mintDirectLink(auth, body.fileId, expirationTime);
	const url = `${getRequestOrigin(request)}/remote.php/direct/${record.token}`;

	return ocsSuccessResponse({ url }, ocsVersion);
}

export function handleDirectTokenRequest(request: Request, token: string): Response {
	const method = request.method.toUpperCase();

	if (method === 'PUT' || method === 'DELETE') {
		return xmlResponse(buildForbiddenXml('Forbidden'), 403);
	}

	if (method !== 'GET' && method !== 'HEAD') {
		return xmlResponse(buildNotFoundXml('Method not allowed'), 405);
	}

	const record = getDirectLinkByToken(token);

	if (!record) {
		return xmlResponse(buildNotFoundXml('File not found'), 404);
	}

	const nowSeconds = Math.floor(Date.now() / 1000);

	if (record.expiration < nowSeconds) {
		return xmlResponse(buildNotFoundXml('File not found'), 404);
	}

	const resolved = resolveDirectFile(record);

	if (resolved === 'not-found' || resolved === 'forbidden') {
		return xmlResponse(buildNotFoundXml('File not found'), 404);
	}

	if (method === 'HEAD') {
		return new Response(null, {
			status: 200,
			headers: {
				'content-type': resolved.contentType,
				'content-length': String(resolved.size),
				etag: resolved.etag,
				'last-modified': new Date(1_694_000_000_000).toUTCString(),
			},
		});
	}

	return fileResponse(resolved);
}
