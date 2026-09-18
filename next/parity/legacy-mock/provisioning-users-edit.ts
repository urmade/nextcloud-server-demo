import { SESSION_COOKIE, USERNAME_COOKIE } from '@/src/server/auth/cookies';
import { getOrCreateSession, updateSession } from '@/src/server/auth/session-store';
import {
	handleEditUser,
	handleEditUserMultiField,
	handleEditUserMultiValue,
} from '@/src/server/provisioning/users-edit';
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

	if (session.lastPasswordConfirm === undefined) {
		session.lastPasswordConfirm = Math.floor(Date.now() / 1000);
	}

	updateSession(session);
}

export function isProvisioningUsersEditMockPath(pathname: string, method = 'GET'): boolean {
	const normalizedMethod = method.toUpperCase();

	if (normalizedMethod === 'PUT' && /^\/ocs\/v2\.php\/cloud\/users\/[^/]+\/[^/]+$/.test(pathname)) {
		const segments = pathname.split('/');

		return segments[segments.length - 1] !== 'enable' && segments[segments.length - 1] !== 'disable';
	}

	if ((normalizedMethod === 'PUT' || normalizedMethod === 'PATCH') && /^\/ocs\/v2\.php\/cloud\/users\/[^/]+$/.test(pathname)) {
		return true;
	}

	return false;
}

export async function handleProvisioningUsersEditMock(
	pathname: string,
	search: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	if (!isProvisioningUsersEditMockPath(pathname, options.method ?? 'GET')) {
		return null;
	}

	ensureSessionFromLoginCookies(options);
	const request = buildRequest(pathname, search, options);
	const method = (options.method ?? 'GET').toUpperCase();

	const collectionMatch = /^\/ocs\/v2\.php\/cloud\/users\/([^/]+)\/([^/]+)$/.exec(pathname);

	if (collectionMatch && method === 'PUT') {
		return responseToSnapshot(
			await handleEditUserMultiValue(
				request,
				decodeURIComponent(collectionMatch[1]),
				decodeURIComponent(collectionMatch[2]),
			),
		);
	}

	const userMatch = /^\/ocs\/v2\.php\/cloud\/users\/([^/]+)$/.exec(pathname);

	if (!userMatch) {
		return null;
	}

	const userId = decodeURIComponent(userMatch[1]);

	if (method === 'PUT') {
		return responseToSnapshot(await handleEditUser(request, userId));
	}

	if (method === 'PATCH') {
		return responseToSnapshot(await handleEditUserMultiField(request, userId));
	}

	return null;
}
