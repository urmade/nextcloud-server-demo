import { handleShareInfo } from '@/src/server/files_sharing/share-info';
import { snapshotResponse } from '../compare';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';

const SHAREINFO_PATH = /^\/(?:index\.php\/)?apps\/files_sharing\/shareinfo\/?$/;

function buildRequest(pathname: string, search: string, options: ParityRequestOptions): Request {
	const origin = 'http://127.0.0.1:3100';

	return new Request(`${origin}${pathname}${search ? `?${search}` : ''}`, {
		method: options.method ?? 'POST',
		headers: options.headers ?? {},
		body: options.body,
	});
}

async function responseToSnapshot(response: Response): Promise<ParityResponseSnapshot> {
	const rawBody = await response.text();

	return snapshotResponse(response, rawBody);
}

export function isFilesSharingShareInfoMockPath(pathname: string, method = 'POST'): boolean {
	return method.toUpperCase() === 'POST' && SHAREINFO_PATH.test(pathname);
}

export async function handleFilesSharingShareInfoMock(
	pathname: string,
	search: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	const method = (options.method ?? 'POST').toUpperCase();

	if (method !== 'POST' || !SHAREINFO_PATH.test(pathname)) {
		return null;
	}

	return responseToSnapshot(await handleShareInfo(buildRequest(pathname, search, options)));
}
