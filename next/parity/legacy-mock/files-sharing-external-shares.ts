import { SESSION_COOKIE, USERNAME_COOKIE } from '@/src/server/auth/cookies';
import { getOrCreateSession, updateSession } from '@/src/server/auth/session-store';
import {
	handleExternalSharesCreate,
	handleExternalSharesDestroy,
	handleExternalSharesIndex,
	handleExternalSharesMissingMethod,
} from '@/src/server/files_sharing/external-shares-api';
import { snapshotResponse } from '../compare';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';
import { parseCookiesFromOptions } from './auth';

const EXTERNAL_SHARES_PATH = /^\/(?:index\.php\/)?apps\/files_sharing\/api\/externalShares\/?$/;
const EXTERNAL_SHARE_ID_PATH = /^\/(?:index\.php\/)?apps\/files_sharing\/api\/externalShares\/([^/]+)\/?$/;

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

export function isFilesSharingExternalSharesMockPath(pathname: string, method = 'GET'): boolean {
	const normalizedMethod = method.toUpperCase();

	if (normalizedMethod === 'GET' && (EXTERNAL_SHARES_PATH.test(pathname) || EXTERNAL_SHARE_ID_PATH.test(pathname))) {
		return true;
	}

	if (normalizedMethod === 'POST' && EXTERNAL_SHARES_PATH.test(pathname)) {
		return true;
	}

	if (normalizedMethod === 'DELETE' && EXTERNAL_SHARE_ID_PATH.test(pathname)) {
		return true;
	}

	if (normalizedMethod === 'PUT' && EXTERNAL_SHARE_ID_PATH.test(pathname)) {
		return true;
	}

	return false;
}

export async function handleFilesSharingExternalSharesMock(
	pathname: string,
	search: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	const method = (options.method ?? 'GET').toUpperCase();

	if (!isFilesSharingExternalSharesMockPath(pathname, method)) {
		return null;
	}

	ensureSessionFromLoginCookies(options);

	const request = buildRequest(pathname, search, options);

	if (method === 'GET' && EXTERNAL_SHARES_PATH.test(pathname)) {
		return responseToSnapshot(handleExternalSharesIndex(request));
	}

	if (method === 'POST' && EXTERNAL_SHARES_PATH.test(pathname)) {
		return responseToSnapshot(await handleExternalSharesCreate(request));
	}

	const idMatch = EXTERNAL_SHARE_ID_PATH.exec(pathname);

	if (idMatch) {
		const id = decodeURIComponent(idMatch[1]);

		if (method === 'DELETE') {
			return responseToSnapshot(handleExternalSharesDestroy(request, id));
		}

		if (method === 'GET' || method === 'PUT') {
			return responseToSnapshot(handleExternalSharesMissingMethod());
		}
	}

	return null;
}
