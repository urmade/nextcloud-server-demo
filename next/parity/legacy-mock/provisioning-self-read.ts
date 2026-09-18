import { SESSION_COOKIE, USERNAME_COOKIE } from '@/src/server/auth/cookies';
import { getOrCreateSession, updateSession } from '@/src/server/auth/session-store';
import {
	handleGetCurrentUser,
	handleGetEditableFields,
	handleGetEditableFieldsForUser,
	handleGetEnabledApps,
	handleGetUser,
} from '@/src/server/provisioning/self-read';
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

export function isProvisioningSelfReadMockPath(pathname: string, method = 'GET'): boolean {
	if (method !== 'GET') {
		return false;
	}

	return pathname === '/ocs/v2.php/cloud/user'
		|| pathname === '/ocs/v2.php/cloud/user/fields'
		|| pathname === '/ocs/v2.php/cloud/user/apps'
		|| /^\/ocs\/v2\.php\/cloud\/user\/fields\/[^/]+$/.test(pathname)
		|| /^\/ocs\/v2\.php\/cloud\/users\/[^/]+$/.test(pathname)
			&& pathname !== '/ocs/v2.php/cloud/users/details'
			&& pathname !== '/ocs/v2.php/cloud/users/disabled'
			&& pathname !== '/ocs/v2.php/cloud/users/recent';
}

export async function handleProvisioningSelfReadMock(
	pathname: string,
	search: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	if (!isProvisioningSelfReadMockPath(pathname, options.method ?? 'GET')) {
		return null;
	}

	ensureSessionFromLoginCookies(options);
	const request = buildRequest(pathname, search, options);

	if (pathname === '/ocs/v2.php/cloud/user') {
		return responseToSnapshot(handleGetCurrentUser(request));
	}

	if (pathname === '/ocs/v2.php/cloud/user/fields') {
		return responseToSnapshot(handleGetEditableFields(request));
	}

	if (pathname === '/ocs/v2.php/cloud/user/apps') {
		return responseToSnapshot(handleGetEnabledApps(request));
	}

	const fieldsMatch = /^\/ocs\/v2\.php\/cloud\/user\/fields\/([^/]+)$/.exec(pathname);

	if (fieldsMatch) {
		return responseToSnapshot(handleGetEditableFieldsForUser(request, decodeURIComponent(fieldsMatch[1])));
	}

	const userMatch = /^\/ocs\/v2\.php\/cloud\/users\/([^/]+)$/.exec(pathname);

	if (userMatch) {
		return responseToSnapshot(handleGetUser(request, decodeURIComponent(userMatch[1])));
	}

	return null;
}
