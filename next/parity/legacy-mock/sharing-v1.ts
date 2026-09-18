import { SESSION_COOKIE, USERNAME_COOKIE } from '@/src/server/auth/cookies';
import { getOrCreateSession, updateSession } from '@/src/server/auth/session-store';
import {
	handleCreateShare,
	handleDeleteShare,
	handleGenerateSecret,
	handleGetShare,
	handleGetShareMethodNotAllowed,
	handleGetShares,
	handleSearchRecipients,
} from '@/src/server/sharing/api-v1';
import { snapshotResponse } from '../compare';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';
import { parseCookiesFromOptions } from './auth';

const SECRET_PATH = '/ocs/v2.php/apps/sharing/api/v1/secret';
const SHARE_PATH = '/ocs/v2.php/apps/sharing/api/v1/share';
const SHARES_PATH = '/ocs/v2.php/apps/sharing/api/v1/shares';
const RECIPIENTS_PATH = '/ocs/v2.php/apps/sharing/api/v1/recipients';
const SHARE_ID_PATH = /^\/ocs\/v2\.php\/apps\/sharing\/api\/v1\/share\/([^/]+)$/;

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

export async function handleSharingV1Mock(
	pathname: string,
	search: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	const method = (options.method ?? 'GET').toUpperCase();

	ensureSessionFromLoginCookies(options);

	if (method === 'GET' && pathname === SECRET_PATH) {
		return responseToSnapshot(handleGenerateSecret(buildRequest(pathname, search, options)));
	}

	if (method === 'POST' && pathname === SHARE_PATH) {
		return responseToSnapshot(handleCreateShare(buildRequest(pathname, search, options)));
	}

	if (method === 'GET' && pathname === SHARES_PATH) {
		return responseToSnapshot(handleGetShares(buildRequest(pathname, search, options)));
	}

	if (method === 'GET' && pathname === RECIPIENTS_PATH) {
		return responseToSnapshot(handleSearchRecipients(buildRequest(pathname, search, options)));
	}

	const shareMatch = SHARE_ID_PATH.exec(pathname);

	if (shareMatch) {
		const id = shareMatch[1];
		const request = buildRequest(pathname, search, options);

		if (method === 'GET') {
			return responseToSnapshot(handleGetShareMethodNotAllowed(request));
		}

		if (method === 'POST') {
			return responseToSnapshot(await handleGetShare(request, id));
		}

		if (method === 'DELETE') {
			return responseToSnapshot(handleDeleteShare(request, id));
		}
	}

	return null;
}

export function isSharingV1MockPath(pathname: string, method: string): boolean {
	const normalizedMethod = method.toUpperCase();

	if (normalizedMethod === 'GET' && (
		pathname === SECRET_PATH
		|| pathname === SHARES_PATH
		|| pathname === RECIPIENTS_PATH
		|| SHARE_ID_PATH.test(pathname)
	)) {
		return true;
	}

	if (normalizedMethod === 'POST' && (
		pathname === SHARE_PATH
		|| SHARE_ID_PATH.test(pathname)
	)) {
		return true;
	}

	if (normalizedMethod === 'DELETE' && SHARE_ID_PATH.test(pathname)) {
		return true;
	}

	return false;
}
