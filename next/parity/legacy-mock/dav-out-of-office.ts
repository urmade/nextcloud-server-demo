import { SESSION_COOKIE, USERNAME_COOKIE } from '@/src/server/auth/cookies';
import { getOrCreateSession, updateSession } from '@/src/server/auth/session-store';
import {
	handleClearOutOfOffice,
	handleGetCurrentOutOfOfficeData,
	handleGetOutOfOffice,
	handleSetOutOfOffice,
} from '@/src/server/dav/out-of-office';
import { snapshotResponse } from '../compare';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';
import { parseCookiesFromOptions } from './auth';

const OUT_OF_OFFICE_PREFIX = '/ocs/v2.php/apps/dav/api/v1/outOfOffice/';

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

function parseOutOfOfficePath(pathname: string): { userId: string; current: boolean } | null {
	if (!pathname.startsWith(OUT_OF_OFFICE_PREFIX)) {
		return null;
	}

	const remainder = pathname.slice(OUT_OF_OFFICE_PREFIX.length);
	const current = remainder.endsWith('/now');

	if (current) {
		const userId = remainder.slice(0, -'/now'.length);

		if (!userId) {
			return null;
		}

		return { userId: decodeURIComponent(userId), current: true };
	}

	if (!remainder || remainder.includes('/')) {
		return null;
	}

	return { userId: decodeURIComponent(remainder), current: false };
}

export async function handleDavOutOfOfficeMock(
	pathname: string,
	search: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	const parsed = parseOutOfOfficePath(pathname);

	if (!parsed) {
		return null;
	}

	const method = (options.method ?? 'GET').toUpperCase();
	ensureSessionFromLoginCookies(options);

	if (parsed.current && method === 'GET') {
		return responseToSnapshot(handleGetCurrentOutOfOfficeData(
			buildRequest(pathname, search, options),
			parsed.userId,
		));
	}

	if (!parsed.current && method === 'GET') {
		return responseToSnapshot(handleGetOutOfOffice(
			buildRequest(pathname, search, options),
			parsed.userId,
		));
	}

	if (!parsed.current && method === 'POST') {
		return responseToSnapshot(await handleSetOutOfOffice(buildRequest(pathname, search, options)));
	}

	if (!parsed.current && method === 'DELETE') {
		return responseToSnapshot(handleClearOutOfOffice(buildRequest(pathname, search, options)));
	}

	return null;
}

export function isDavOutOfOfficeMockPath(pathname: string): boolean {
	return parseOutOfOfficePath(pathname) !== null;
}
