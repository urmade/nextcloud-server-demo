import { SESSION_COOKIE, USERNAME_COOKIE } from '@/src/server/auth/cookies';
import { getOrCreateSession, updateSession } from '@/src/server/auth/session-store';
import { handleAcceptPost, handleShowAccept } from '@/src/server/files_sharing/accept';
import { snapshotResponse } from '../compare';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';
import { parseCookiesFromOptions } from './auth';

const ACCEPT_PATH = /^\/(?:index\.php\/)?apps\/files_sharing\/accept\/([^/]+)\/?$/;

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

export function isFilesSharingAcceptMockPath(pathname: string, method = 'GET'): boolean {
	const normalizedMethod = method.toUpperCase();

	if (normalizedMethod !== 'GET' && normalizedMethod !== 'POST') {
		return false;
	}

	return ACCEPT_PATH.test(pathname);
}

export async function handleFilesSharingAcceptMock(
	pathname: string,
	search: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	const method = (options.method ?? 'GET').toUpperCase();
	const match = ACCEPT_PATH.exec(pathname);

	if (!match) {
		return null;
	}

	ensureSessionFromLoginCookies(options);

	const shareId = decodeURIComponent(match[1]);
	const request = buildRequest(pathname, search, options);

	if (method === 'GET') {
		return responseToSnapshot(handleShowAccept(request, shareId));
	}

	return responseToSnapshot(await handleAcceptPost(request, shareId));
}
