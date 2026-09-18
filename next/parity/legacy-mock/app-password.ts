import { parseCookieHeader, SESSION_COOKIE, USERNAME_COOKIE } from '@/src/server/auth/cookies';
import { getOrCreateSession, getSession, updateSession } from '@/src/server/auth/session-store';
import { lookupAppPasswordToken } from '@/src/server/ocs/app-password-store';
import {
	handleConfirmUserPassword,
	handleDeleteAppPassword,
	handleGetAppPassword,
	handleGetAppPasswordWithOneTimePassword,
	handleRotateAppPassword,
	markOneTimeTokenSession,
} from '@/src/server/ocs/app-password';
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

function syncAppPasswordSession(options: ParityRequestOptions): void {
	ensureSessionFromLoginCookies(options);
	const cookies = parseCookiesFromOptions(options);
	const session = getSession(cookies[SESSION_COOKIE]);

	if (!session) {
		return;
	}

	const authorization = options.headers?.authorization ?? options.headers?.Authorization;
	const match = authorization ? /^Basic\s+(.+)$/i.exec(authorization.trim()) : null;

	if (!match) {
		return;
	}

	const decoded = Buffer.from(match[1], 'base64').toString('utf8');
	const separatorIndex = decoded.indexOf(':');

	if (separatorIndex < 0) {
		return;
	}

	const token = decoded.slice(separatorIndex + 1);
	const stored = lookupAppPasswordToken(token);

	if (stored && stored.userId === session.userId) {
		session.appPassword = token;
		updateSession(session);
	}
}

export async function handleAppPasswordMock(
	pathname: string,
	search: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	const method = (options.method ?? 'GET').toUpperCase();

	ensureSessionFromLoginCookies(options);
	syncAppPasswordSession(options);

	if (pathname === '/ocs/v2.php/core/getapppassword-onetime' && method === 'GET') {
		return responseToSnapshot(handleGetAppPasswordWithOneTimePassword(buildRequest(pathname, search, options)));
	}

	if (pathname === '/ocs/v2.php/core/getapppassword' && method === 'GET') {
		return responseToSnapshot(handleGetAppPassword(buildRequest(pathname, search, options)));
	}

	if (pathname === '/ocs/v2.php/core/apppassword' && method === 'DELETE') {
		return responseToSnapshot(handleDeleteAppPassword(buildRequest(pathname, search, options)));
	}

	if (pathname === '/ocs/v2.php/core/apppassword/rotate' && method === 'POST') {
		return responseToSnapshot(handleRotateAppPassword(buildRequest(pathname, search, options)));
	}

	if (pathname === '/ocs/v2.php/core/apppassword/confirm' && method === 'PUT') {
		return responseToSnapshot(await handleConfirmUserPassword(buildRequest(pathname, search, options)));
	}

	return null;
}

export function prepareOneTimeTokenSession(sessionId: string): void {
	markOneTimeTokenSession(sessionId);
}

export function expirePasswordConfirmation(sessionId: string): void {
	const session = getSession(sessionId);

	if (!session) {
		return;
	}

	session.lastPasswordConfirm = 0;
	updateSession(session);
}
