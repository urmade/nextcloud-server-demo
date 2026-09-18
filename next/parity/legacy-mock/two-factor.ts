import { parseCookieHeader, SESSION_COOKIE, USERNAME_COOKIE } from '@/src/server/auth/cookies';
import { getOrCreateSession, getSession, updateSession } from '@/src/server/auth/session-store';
import {
	handleTwoFactorDisable,
	handleTwoFactorEnable,
	handleTwoFactorState,
} from '@/src/server/two-factor/api';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';
import { snapshotResponse } from '../compare';
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

	if (session.lastPasswordConfirm === undefined) {
		session.lastPasswordConfirm = Math.floor(Date.now() / 1000);
	}

	updateSession(session);
}

export async function handleTwoFactorMock(
	pathname: string,
	search: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	const method = (options.method ?? 'GET').toUpperCase();

	ensureSessionFromLoginCookies(options);

	if (method === 'GET' && pathname === '/ocs/v2.php/twofactor/state') {
		return responseToSnapshot(handleTwoFactorState(buildRequest(pathname, search, options)));
	}

	if (method === 'POST' && pathname === '/ocs/v2.php/twofactor/enable') {
		return responseToSnapshot(await handleTwoFactorEnable(buildRequest(pathname, search, options)));
	}

	if (method === 'POST' && pathname === '/ocs/v2.php/twofactor/disable') {
		return responseToSnapshot(await handleTwoFactorDisable(buildRequest(pathname, search, options)));
	}

	return null;
}

export function expireTwoFactorPasswordConfirmation(sessionId: string): void {
	const session = getSession(sessionId);

	if (!session) {
		return;
	}

	session.lastPasswordConfirm = 0;
	updateSession(session);
}

export function seedNonAdminSession(sessionId: string, userId = 'alice'): void {
	const session = getOrCreateSession(sessionId);
	session.userId = userId;
	session.loginName = userId;
	session.lastPasswordConfirm = Math.floor(Date.now() / 1000);
	updateSession(session);
}

export function getSessionIdFromOptions(options: ParityRequestOptions): string | undefined {
	return parseCookieHeader(options.headers?.cookie ?? options.headers?.Cookie ?? null)[SESSION_COOKIE];
}
