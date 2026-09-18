import {
	handleContactsMenuContacts,
	handleContactsMenuFindOne,
	handleContactsMenuTeams,
	handleDisplayNames,
} from '@/src/server/contactsmenu/api';
import { SESSION_COOKIE, USERNAME_COOKIE } from '@/src/server/auth/cookies';
import { getOrCreateSession, updateSession } from '@/src/server/auth/session-store';
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

function normalizePath(pathname: string): string {
	if (pathname.startsWith('/index.php/')) {
		return pathname.slice('/index.php'.length);
	}

	return pathname;
}

export async function handleContactsMenuMock(
	pathname: string,
	search: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	const normalized = normalizePath(pathname);
	const method = (options.method ?? 'GET').toUpperCase();

	ensureSessionFromLoginCookies(options);

	if (normalized === '/contactsmenu/contacts' && method === 'POST') {
		return responseToSnapshot(await handleContactsMenuContacts(buildRequest(normalized, search, options)));
	}

	if (normalized === '/contactsmenu/findOne' && method === 'POST') {
		return responseToSnapshot(await handleContactsMenuFindOne(buildRequest(normalized, search, options)));
	}

	if (normalized === '/contactsmenu/teams' && method === 'GET') {
		return responseToSnapshot(await handleContactsMenuTeams(buildRequest(normalized, search, options)));
	}

	if (normalized === '/displaynames' && method === 'POST') {
		return responseToSnapshot(await handleDisplayNames(buildRequest(normalized, search, options)));
	}

	return null;
}
