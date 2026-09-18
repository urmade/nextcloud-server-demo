import { resolveSession } from '@/src/server/auth/session';
import { getPreviewFixture } from '@/src/server/fixtures/binary';
import { binaryResponse, cacheForSeconds, jsonArrayResponse } from '@/src/server/http/binary';
import type { DavFileNode } from '@/src/server/dav/types';
import { PERMISSION_READ } from './constants';
import { resolveUserNode } from './nodes';
import { runPublicShareMiddleware } from './public-link';
import type { ShareRecord } from './types';

function shareCanSeeContent(share: ShareRecord): boolean {
	return !share.hideDownload;
}

function resolvePreviewFile(
	share: ShareRecord,
	fileParam: string,
): DavFileNode | 'bad-request' | 'not-found' {
	const located = resolveUserNode(share.shareOwner, share.nodeId);

	if (!located) {
		return 'not-found';
	}

	if (located.node.kind === 'file') {
		return located.node;
	}

	if (fileParam === '') {
		return 'bad-request';
	}

	const child = located.node.children?.find((entry) => entry.name === fileParam);

	if (!child) {
		return 'not-found';
	}

	if (child.kind === 'directory') {
		return 'bad-request';
	}

	return child;
}

function buildPreviewResponse(
	file: DavFileNode,
	cacheSeconds: number,
): Response {
	const bytes = getPreviewFixture();
	const contentType = file.contentType?.startsWith('image/')
		? file.contentType
		: 'image/png';
	const response = binaryResponse(bytes, 200, contentType ?? 'image/png');

	return cacheForSeconds(response, cacheSeconds);
}

export function handleGetPreview(request: Request, token: string): Response {
	const url = new URL(request.url);
	const file = url.searchParams.get('file') ?? '';
	const x = Number.parseInt(url.searchParams.get('x') ?? '32', 10);
	const y = Number.parseInt(url.searchParams.get('y') ?? '32', 10);
	if (token === '' || x === 0 || y === 0) {
		return jsonArrayResponse(400);
	}

	const resolved = resolveSession(request);
	const middleware = runPublicShareMiddleware(request, token, resolved, {
		methodName: 'getPreview',
		isAuthController: false,
	});

	if (middleware instanceof Response) {
		return middleware;
	}

	const share = middleware;

	if ((share.permissions & PERMISSION_READ) === 0) {
		return jsonArrayResponse(403);
	}

	const downloadForbidden = !shareCanSeeContent(share);
	const isPublicPreview = request.headers.get('x-nc-preview') === 'true';
	let cacheSeconds = 60 * 60 * 24;

	if (isPublicPreview && downloadForbidden) {
		cacheSeconds = 15 * 60;
	} else if (downloadForbidden) {
		return jsonArrayResponse(403);
	}

	const previewTarget = resolvePreviewFile(share, file);

	if (previewTarget === 'bad-request') {
		return jsonArrayResponse(400);
	}

	if (previewTarget === 'not-found') {
		return jsonArrayResponse(404);
	}

	return buildPreviewResponse(previewTarget, cacheSeconds);
}
