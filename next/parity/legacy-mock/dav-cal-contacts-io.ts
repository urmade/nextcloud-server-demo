import { SESSION_COOKIE, USERNAME_COOKIE } from '@/src/server/auth/cookies';
import { getOrCreateSession, updateSession } from '@/src/server/auth/session-store';
import {
	handleCalendarExport,
	handleCalendarImport,
	handleContactsImport,
} from '@/src/server/dav/cal-contacts-io';
import { snapshotResponse } from '../compare';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';
import { parseCookiesFromOptions } from './auth';

const CALENDAR_EXPORT_PATH = '/ocs/v2.php/calendar/export';
const CALENDAR_IMPORT_PATH = '/ocs/v2.php/calendar/import';
const CONTACTS_IMPORT_PATH = '/ocs/v2.php/contacts/import';

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

export function isDavCalContactsIoMockPath(pathname: string, method = 'POST'): boolean {
	if (method.toUpperCase() !== 'POST') {
		return false;
	}

	return pathname === CALENDAR_EXPORT_PATH
		|| pathname === CALENDAR_IMPORT_PATH
		|| pathname === CONTACTS_IMPORT_PATH;
}

export async function handleDavCalContactsIoMock(
	pathname: string,
	search: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	const method = (options.method ?? 'GET').toUpperCase();

	if (method !== 'POST') {
		return null;
	}

	ensureSessionFromLoginCookies(options);
	const request = buildRequest(pathname, search, options);

	if (pathname === CALENDAR_EXPORT_PATH) {
		return responseToSnapshot(await handleCalendarExport(request));
	}

	if (pathname === CALENDAR_IMPORT_PATH) {
		return responseToSnapshot(await handleCalendarImport(request));
	}

	if (pathname === CONTACTS_IMPORT_PATH) {
		return responseToSnapshot(await handleContactsImport(request));
	}

	return null;
}
