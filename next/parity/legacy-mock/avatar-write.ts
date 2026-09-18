import { handleDeleteAvatar, handlePostAvatar } from '@/src/server/avatar/write';
import { snapshotResponse } from '../compare';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';

function buildRequest(pathname: string, options: ParityRequestOptions): Request {
	const origin = 'http://127.0.0.1:3100';

	return new Request(`${origin}${pathname}`, {
		method: options.method ?? 'GET',
		headers: options.headers ?? {},
		body: options.body,
	});
}

async function responseToSnapshot(response: Response): Promise<ParityResponseSnapshot> {
	const rawBody = await response.text();

	return snapshotResponse(response, rawBody);
}

function isAvatarWritePath(pathname: string): boolean {
	return pathname === '/avatar'
		|| pathname === '/avatar/'
		|| pathname === '/index.php/avatar'
		|| pathname === '/index.php/avatar/';
}

export async function handleAvatarWriteMock(
	pathname: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	const method = (options.method ?? 'GET').toUpperCase();

	if (!isAvatarWritePath(pathname)) {
		return null;
	}

	if (method === 'POST') {
		return responseToSnapshot(await handlePostAvatar(buildRequest(pathname, options)));
	}

	if (method === 'DELETE') {
		return responseToSnapshot(await handleDeleteAvatar(buildRequest(pathname, options)));
	}

	return null;
}
