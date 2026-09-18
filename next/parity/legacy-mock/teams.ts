import { handleListTeams, handleResolveOne } from '@/src/server/teams/api';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';
import { snapshotResponse } from '../compare';
import { parseCookiesFromOptions } from './auth';
import { SESSION_COOKIE, USERNAME_COOKIE } from '@/src/server/auth/cookies';
import { getOrCreateSession, updateSession } from '@/src/server/auth/session-store';

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

export async function handleTeamsMock(
	pathname: string,
	search: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	const method = (options.method ?? 'GET').toUpperCase();

	if (method !== 'GET' || !pathname.startsWith('/ocs/v2.php/teams/')) {
		return null;
	}

	ensureSessionFromLoginCookies(options);

	const listMatch = /^\/ocs\/v2\.php\/teams\/resources\/([^/]+)\/([^/]+)$/.exec(pathname);

	if (listMatch) {
		return responseToSnapshot(handleListTeams(
			buildRequest(pathname, search, options),
			decodeURIComponent(listMatch[1]),
			decodeURIComponent(listMatch[2]),
		));
	}

	const resolveMatch = /^\/ocs\/v2\.php\/teams\/([^/]+)\/resources$/.exec(pathname);

	if (resolveMatch) {
		return responseToSnapshot(handleResolveOne(
			buildRequest(pathname, search, options),
			decodeURIComponent(resolveMatch[1]),
		));
	}

	return null;
}
