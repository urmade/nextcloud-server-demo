import { SESSION_COOKIE, USERNAME_COOKIE } from '@/src/server/auth/cookies';
import { getOrCreateSession, updateSession } from '@/src/server/auth/session-store';
import {
	handleGetDisabledUsersDetails,
	handleGetRecentUsers,
	handleGetUsers,
	handleGetUsersDetails,
} from '@/src/server/provisioning/users-list';
import { snapshotResponse } from '../compare';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';
import { parseCookiesFromOptions } from './auth';

const USERS_LIST_PATHS = new Set([
	'/ocs/v2.php/cloud/users',
	'/ocs/v2.php/cloud/users/details',
	'/ocs/v2.php/cloud/users/disabled',
	'/ocs/v2.php/cloud/users/recent',
]);

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

export function isProvisioningUsersListMockPath(pathname: string, method = 'GET'): boolean {
	return method === 'GET' && USERS_LIST_PATHS.has(pathname);
}

export async function handleProvisioningUsersListMock(
	pathname: string,
	search: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	if (!isProvisioningUsersListMockPath(pathname, options.method ?? 'GET')) {
		return null;
	}

	ensureSessionFromLoginCookies(options);
	const request = buildRequest(pathname, search, options);

	if (pathname === '/ocs/v2.php/cloud/users') {
		return responseToSnapshot(handleGetUsers(request));
	}

	if (pathname === '/ocs/v2.php/cloud/users/details') {
		return responseToSnapshot(handleGetUsersDetails(request));
	}

	if (pathname === '/ocs/v2.php/cloud/users/disabled') {
		return responseToSnapshot(handleGetDisabledUsersDetails(request));
	}

	if (pathname === '/ocs/v2.php/cloud/users/recent') {
		return responseToSnapshot(handleGetRecentUsers(request));
	}

	return null;
}
