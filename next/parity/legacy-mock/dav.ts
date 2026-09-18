import { resolveDavUserIdWithAppPasswords } from '@/src/server/dav/auth-extended';
import { handleDavRequest } from '@/src/server/dav/handler';
import { snapshotResponse } from '../compare';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';

const DAV_REMOTE_PREFIXES = [
	'/remote.php/dav',
	'/remote.php/webdav',
	'/remote.php/files',
];

export function isDavRemotePath(pathname: string): boolean {
	return DAV_REMOTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function handleDavMock(
	pathname: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	if (!isDavRemotePath(pathname)) {
		return null;
	}

	const method = (options.method ?? 'GET').toUpperCase();

	if (method !== 'PROPFIND' && method !== 'OPTIONS') {
		return null;
	}

	const request = new Request(`http://127.0.0.1:3100${pathname}`, {
		method,
		headers: options.headers,
		body: options.body,
	});
	const response = await handleDavRequest(request, resolveDavUserIdWithAppPasswords);
	const rawBody = await response.text();

	return snapshotResponse(response, rawBody);
}
