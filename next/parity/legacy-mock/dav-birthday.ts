import { SESSION_COOKIE, USERNAME_COOKIE } from '@/src/server/auth/cookies';
import { getOrCreateSession, updateSession } from '@/src/server/auth/session-store';
import {
	handleDisableBirthdayCalendar,
	handleEnableBirthdayCalendar,
} from '@/src/server/dav/birthday-calendar';
import { snapshotResponse } from '../compare';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';
import { parseCookiesFromOptions } from './auth';

const ENABLE_PATH = '/apps/dav/enableBirthdayCalendar';
const DISABLE_PATH = '/apps/dav/disableBirthdayCalendar';

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

function normalizePath(pathname: string): string {
	if (pathname.startsWith('/index.php/')) {
		return pathname.slice('/index.php'.length);
	}

	return pathname;
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

export function isDavBirthdayMockPath(pathname: string, method = 'POST'): boolean {
	if (method.toUpperCase() !== 'POST') {
		return false;
	}

	const normalized = normalizePath(pathname);

	return normalized === ENABLE_PATH || normalized === DISABLE_PATH;
}

export async function handleDavBirthdayMock(
	pathname: string,
	search: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	const method = (options.method ?? 'GET').toUpperCase();

	if (method !== 'POST') {
		return null;
	}

	const normalized = normalizePath(pathname);
	const request = buildRequest(normalized, search, options);

	ensureSessionFromLoginCookies(options);

	if (normalized === ENABLE_PATH) {
		return responseToSnapshot(handleEnableBirthdayCalendar(request));
	}

	if (normalized === DISABLE_PATH) {
		return responseToSnapshot(handleDisableBirthdayCalendar(request));
	}

	return null;
}
