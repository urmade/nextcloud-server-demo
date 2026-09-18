import { handleDirectGetUrl, handleDirectTokenRequest } from '@/src/server/dav/direct';
import { SESSION_COOKIE, USERNAME_COOKIE } from '@/src/server/auth/cookies';
import { getOrCreateSession, updateSession } from '@/src/server/auth/session-store';
import { snapshotResponse } from '../compare';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';
import { parseCookiesFromOptions } from './auth';

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

function ensureSessionFromLoginCookies(options: ParityRequestOptions): void {
	const cookies = parseCookiesFromOptions(options);
	const sessionId = cookies[SESSION_COOKIE];
	const userId = cookies[USERNAME_COOKIE];

	if (!sessionId || !userId) {
		return;
	}

	const session = getOrCreateSession(sessionId);
	session.userId = userId;
	session.loginName = userId;
	updateSession(session);
}

export async function handleDavDirectMock(
	pathname: string,
	search: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	const method = (options.method ?? 'GET').toUpperCase();

	if (method === 'POST' && pathname === '/ocs/v2.php/apps/dav/api/v1/direct') {
		ensureSessionFromLoginCookies(options);

		return responseToSnapshot(await handleDirectGetUrl(buildRequest(pathname, search, options)));
	}

	const directMatch = /^\/remote\.php\/direct\/([^/]+)$/.exec(pathname);

	if (directMatch) {
		return responseToSnapshot(handleDirectTokenRequest(
			buildRequest(pathname, search, options),
			decodeURIComponent(directMatch[1]),
		));
	}

	return null;
}

export function isDavDirectMockPath(pathname: string, method: string): boolean {
	const normalizedMethod = method.toUpperCase();

	if (normalizedMethod === 'POST' && pathname === '/ocs/v2.php/apps/dav/api/v1/direct') {
		return true;
	}

	return /^\/remote\.php\/direct\/[^/]+$/.test(pathname);
}
