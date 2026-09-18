import { SESSION_COOKIE, USERNAME_COOKIE } from '@/src/server/auth/cookies';
import { getOrCreateSession, updateSession } from '@/src/server/auth/session-store';
import { handleSearchByPhoneNumbers } from '@/src/server/provisioning/phone-search';
import { snapshotResponse } from '../compare';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';
import { parseCookiesFromOptions } from './auth';

const PHONE_SEARCH_PATH = '/ocs/v2.php/cloud/users/search/by-phone';

function buildRequest(pathname: string, search: string, options: ParityRequestOptions): Request {
	const origin = 'http://127.0.0.1:3100';

	return new Request(`${origin}${pathname}${search ? `?${search}` : ''}`, {
		method: options.method ?? 'POST',
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

export function isProvisioningPhoneSearchMockPath(pathname: string, method = 'POST'): boolean {
	return method === 'POST' && pathname === PHONE_SEARCH_PATH;
}

export async function handleProvisioningPhoneSearchMock(
	pathname: string,
	search: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	if (!isProvisioningPhoneSearchMockPath(pathname, options.method ?? 'POST')) {
		return null;
	}

	ensureSessionFromLoginCookies(options);
	const request = buildRequest(pathname, search, options);

	return responseToSnapshot(await handleSearchByPhoneNumbers(request));
}
