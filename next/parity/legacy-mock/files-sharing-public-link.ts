import {
	handleAuthenticate,
	handleDirectLink,
	handleDownloadShare,
	handleShowAuthenticate,
	handleShowShare,
} from '@/src/server/files_sharing/public-link';
import { snapshotResponse } from '../compare';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';

const SHOW_SHARE_PATH = /^\/s\/([^/]+)\/?$/;
const AUTHENTICATE_PATH = /^\/s\/([^/]+)\/authenticate\/([^/]+)\/?$/;
const DOWNLOAD_PATH = /^\/s\/([^/]+)\/download(?:\/(.*))?\/?$/;
const PREVIEW_PATH = /^\/(?:index\.php\/)?s\/([^/]+)\/preview\/?$/;

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

export function isFilesSharingPublicLinkMockPath(pathname: string, method = 'GET'): boolean {
	const normalizedMethod = method.toUpperCase();

	if (normalizedMethod === 'GET' && (
		SHOW_SHARE_PATH.test(pathname)
		|| AUTHENTICATE_PATH.test(pathname)
		|| DOWNLOAD_PATH.test(pathname)
		|| PREVIEW_PATH.test(pathname)
	)) {
		return true;
	}

	if (normalizedMethod === 'POST' && AUTHENTICATE_PATH.test(pathname)) {
		return true;
	}

	return false;
}

export async function handleFilesSharingPublicLinkMock(
	pathname: string,
	search: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	const method = (options.method ?? 'GET').toUpperCase();

	const previewMatch = PREVIEW_PATH.exec(pathname);

	if (method === 'GET' && previewMatch) {
		return responseToSnapshot(handleDirectLink(buildRequest(pathname, search, options), previewMatch[1]));
	}

	const authenticateMatch = AUTHENTICATE_PATH.exec(pathname);

	if (authenticateMatch) {
		const token = authenticateMatch[1];
		const redirect = authenticateMatch[2];

		if (method === 'GET') {
			return responseToSnapshot(handleShowAuthenticate(buildRequest(pathname, search, options), token));
		}

		if (method === 'POST') {
			return responseToSnapshot(await handleAuthenticate(buildRequest(pathname, search, options), token, redirect));
		}
	}

	const downloadMatch = DOWNLOAD_PATH.exec(pathname);

	if (method === 'GET' && downloadMatch) {
		const filename = downloadMatch[2] ?? '';

		return responseToSnapshot(handleDownloadShare(buildRequest(pathname, search, options), downloadMatch[1], filename));
	}

	const showShareMatch = SHOW_SHARE_PATH.exec(pathname);

	if (method === 'GET' && showShareMatch) {
		return responseToSnapshot(handleShowShare(buildRequest(pathname, search, options), showShareMatch[1]));
	}

	return null;
}
