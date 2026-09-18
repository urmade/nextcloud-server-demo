import { handlePublicDavRequest } from '@/src/server/dav/public-handler';
import { snapshotResponse } from '../compare';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';

const PUBLIC_DAV_PREFIXES = [
	'/public.php/dav',
	'/public.php/webdav',
];

const PUBLIC_DAV_METHODS = new Set([
	'PROPFIND',
	'OPTIONS',
	'GET',
	'HEAD',
	'PUT',
]);

export function isPublicDavMockPath(pathname: string): boolean {
	return PUBLIC_DAV_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isPublicDavMockMethod(method: string): boolean {
	return PUBLIC_DAV_METHODS.has(method.toUpperCase());
}

export async function handleFilesSharingPublicDavMock(
	pathname: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	if (!isPublicDavMockPath(pathname)) {
		return null;
	}

	const method = (options.method ?? 'GET').toUpperCase();

	if (!PUBLIC_DAV_METHODS.has(method)) {
		return null;
	}

	const request = new Request(`http://127.0.0.1:3100${pathname}`, {
		method,
		headers: options.headers,
		body: options.body,
	});
	const response = await handlePublicDavRequest(request);
	const rawBody = await response.text();

	return snapshotResponse(response, rawBody);
}
