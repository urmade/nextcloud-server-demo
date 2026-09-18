import { handleGetPreview } from '@/src/server/files_sharing/public-preview';
import { snapshotResponse } from '../compare';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';

const PREVIEW_PATH = /^\/(?:index\.php\/)?apps\/files_sharing\/publicpreview\/([^/]+)\/?$/;

function buildRequest(pathname: string, search: string, options: ParityRequestOptions): Request {
	const origin = 'http://127.0.0.1:3100';

	return new Request(`${origin}${pathname}${search ? `?${search}` : ''}`, {
		method: options.method ?? 'GET',
		headers: options.headers ?? {},
		body: options.body,
	});
}

async function responseToSnapshot(response: Response): Promise<ParityResponseSnapshot> {
	const rawBody = await response.text();

	return snapshotResponse(response, rawBody);
}

export function isFilesSharingPublicPreviewMockPath(pathname: string, method = 'GET'): boolean {
	return method.toUpperCase() === 'GET' && PREVIEW_PATH.test(pathname);
}

export async function handleFilesSharingPublicPreviewMock(
	pathname: string,
	search: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	const method = (options.method ?? 'GET').toUpperCase();

	if (method !== 'GET') {
		return null;
	}

	const match = PREVIEW_PATH.exec(pathname);

	if (!match) {
		return null;
	}

	return responseToSnapshot(handleGetPreview(buildRequest(pathname, search, options), match[1]));
}
