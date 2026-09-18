import { SESSION_COOKIE, USERNAME_COOKIE } from '@/src/server/auth/cookies';
import { getOrCreateSession, updateSession } from '@/src/server/auth/session-store';
import {
	handleAddUser,
	handleDeleteUser,
	handleDisableUser,
	handleEnableUser,
	handleResendWelcomeMessage,
	handleWipeUserDevices,
} from '@/src/server/provisioning/users-lifecycle';
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

export function isProvisioningUsersLifecycleMockPath(pathname: string, method = 'GET'): boolean {
	if (method === 'POST' && pathname === '/ocs/v2.php/cloud/users') {
		return true;
	}

	if (method === 'DELETE' && /^\/ocs\/v2\.php\/cloud\/users\/[^/]+$/.test(pathname)) {
		return true;
	}

	if (method === 'PUT' && /^\/ocs\/v2\.php\/cloud\/users\/[^/]+\/(enable|disable)$/.test(pathname)) {
		return true;
	}

	if (method === 'POST' && /^\/ocs\/v2\.php\/cloud\/users\/[^/]+\/(wipe|welcome)$/.test(pathname)) {
		return true;
	}

	return false;
}

export async function handleProvisioningUsersLifecycleMock(
	pathname: string,
	search: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	if (!isProvisioningUsersLifecycleMockPath(pathname, options.method ?? 'GET')) {
		return null;
	}

	ensureSessionFromLoginCookies(options);
	const request = buildRequest(pathname, search, options);

	if (pathname === '/ocs/v2.php/cloud/users' && (options.method ?? 'GET') === 'POST') {
		return responseToSnapshot(await handleAddUser(request));
	}

	const deleteMatch = /^\/ocs\/v2\.php\/cloud\/users\/([^/]+)$/.exec(pathname);

	if (deleteMatch && (options.method ?? 'GET') === 'DELETE') {
		return responseToSnapshot(await handleDeleteUser(request, decodeURIComponent(deleteMatch[1])));
	}

	const enableMatch = /^\/ocs\/v2\.php\/cloud\/users\/([^/]+)\/enable$/.exec(pathname);

	if (enableMatch && (options.method ?? 'GET') === 'PUT') {
		return responseToSnapshot(await handleEnableUser(request, decodeURIComponent(enableMatch[1])));
	}

	const disableMatch = /^\/ocs\/v2\.php\/cloud\/users\/([^/]+)\/disable$/.exec(pathname);

	if (disableMatch && (options.method ?? 'GET') === 'PUT') {
		return responseToSnapshot(await handleDisableUser(request, decodeURIComponent(disableMatch[1])));
	}

	const wipeMatch = /^\/ocs\/v2\.php\/cloud\/users\/([^/]+)\/wipe$/.exec(pathname);

	if (wipeMatch && (options.method ?? 'GET') === 'POST') {
		return responseToSnapshot(await handleWipeUserDevices(request, decodeURIComponent(wipeMatch[1])));
	}

	const welcomeMatch = /^\/ocs\/v2\.php\/cloud\/users\/([^/]+)\/welcome$/.exec(pathname);

	if (welcomeMatch && (options.method ?? 'GET') === 'POST') {
		return responseToSnapshot(await handleResendWelcomeMessage(request, decodeURIComponent(welcomeMatch[1])));
	}

	return null;
}
