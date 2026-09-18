import { SESSION_COOKIE, USERNAME_COOKIE } from '@/src/server/auth/cookies';
import { getOrCreateSession, updateSession } from '@/src/server/auth/session-store';
import {
	handleFilenamesGetStatus,
	handleFilenamesSanitize,
	handleFilenamesStopSanitization,
	handleFilenamesToggleWindowsSupport,
} from '@/src/server/files/filenames';
import { snapshotResponse } from '../compare';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';
import { parseCookiesFromOptions } from './auth';

const SANITIZATION_PATH = '/ocs/v2.php/apps/files/api/v1/filenames/sanitization';
const WINDOWS_COMPAT_PATH = '/ocs/v2.php/apps/files/api/v1/filenames/windows-compatibility';

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

export function seedNonAdminSession(sessionId: string, userId = 'alice'): void {
	const session = getOrCreateSession(sessionId);
	session.userId = userId;
	session.loginName = userId;
	updateSession(session);
}

export function getFilenamesSessionId(options: ParityRequestOptions): string | undefined {
	return parseCookiesFromOptions(options)[SESSION_COOKIE];
}

export async function handleFilesFilenamesMock(
	pathname: string,
	search: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	const method = (options.method ?? 'GET').toUpperCase();

	ensureSessionFromLoginCookies(options);

	if (pathname === SANITIZATION_PATH) {
		const request = buildRequest(pathname, search, options);

		if (method === 'GET') {
			return responseToSnapshot(handleFilenamesGetStatus(request));
		}

		if (method === 'POST') {
			return responseToSnapshot(await handleFilenamesSanitize(request));
		}

		if (method === 'DELETE') {
			return responseToSnapshot(handleFilenamesStopSanitization(request));
		}
	}

	if (method === 'POST' && pathname === WINDOWS_COMPAT_PATH) {
		return responseToSnapshot(await handleFilenamesToggleWindowsSupport(buildRequest(pathname, search, options)));
	}

	return null;
}

export function isFilesFilenamesMockPath(pathname: string): boolean {
	return pathname === SANITIZATION_PATH || pathname === WINDOWS_COMPAT_PATH;
}
