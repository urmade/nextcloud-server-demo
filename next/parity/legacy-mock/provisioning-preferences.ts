import { SESSION_COOKIE, USERNAME_COOKIE } from '@/src/server/auth/cookies';
import { getOrCreateSession, updateSession } from '@/src/server/auth/session-store';
import {
	handleDeleteMultiplePreferences,
	handleDeletePreference,
	handleSetMultiplePreferences,
	handleSetPreference,
} from '@/src/server/provisioning/preferences';
import { snapshotResponse } from '../compare';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';
import { parseCookiesFromOptions } from './auth';

const PREFERENCES_BASE = '/ocs/v2.php/apps/provisioning_api/api/v1/config/users';

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

function parsePreferencePath(pathname: string): { appId: string; configKey?: string } | null {
	const prefix = `${PREFERENCES_BASE}/`;

	if (!pathname.startsWith(prefix)) {
		return null;
	}

	const remainder = pathname.slice(prefix.length);
	const segments = remainder.split('/').filter(Boolean);

	if (segments.length === 0 || segments.length > 2) {
		return null;
	}

	if (segments.length === 1) {
		return { appId: segments[0] };
	}

	return { appId: segments[0], configKey: segments[1] };
}

export function isProvisioningPreferencesMockPath(pathname: string): boolean {
	return pathname.startsWith(`${PREFERENCES_BASE}/`);
}

export async function handleProvisioningPreferencesMock(
	pathname: string,
	search: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	const parsed = parsePreferencePath(pathname);

	if (!parsed) {
		return null;
	}

	ensureSessionFromLoginCookies(options);
	const request = buildRequest(pathname, search, options);
	const method = options.method ?? 'GET';

	if (parsed.configKey) {
		if (method === 'POST') {
			return responseToSnapshot(await handleSetPreference(request, parsed.appId, parsed.configKey));
		}

		if (method === 'DELETE') {
			return responseToSnapshot(await handleDeletePreference(request, parsed.appId, parsed.configKey));
		}

		return null;
	}

	if (method === 'POST') {
		return responseToSnapshot(await handleSetMultiplePreferences(request, parsed.appId));
	}

	if (method === 'DELETE') {
		return responseToSnapshot(await handleDeleteMultiplePreferences(request, parsed.appId, search));
	}

	return null;
}
