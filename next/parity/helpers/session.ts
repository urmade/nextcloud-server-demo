import { seedParityLoginFlowV2Store } from '@/src/server/auth/login-flow-v2-store';
import { SESSION_COOKIE, USERNAME_COOKIE } from '@/src/server/auth/cookies';
import { decryptCsrfToken } from '@/src/server/auth/csrf';
import { getOrCreateSession, type SessionData, updateSession } from '@/src/server/auth/session-store';
import { getParityEnv } from '../env';
import { cookieJarToHeader, mergeResponseCookies } from '../helpers/cookies';
import { expirePasswordConfirmation } from '../legacy-mock/app-password';

/**
 * Mirror a browser session into the in-process legacy-mock session store without
 * logging it in. The mock and the Next.js server keep separate stores, so a CSRF
 * token minted over HTTP is unknown to the mock until it is seeded here.
 */
export function seedParityGuestSessionFromJar(
	jar: Record<string, string>,
	csrfToken: string,
): SessionData | null {
	const sessionId = jar[SESSION_COOKIE];

	if (!sessionId) {
		return null;
	}

	const session = getOrCreateSession(sessionId);
	const rawToken = decryptCsrfToken(csrfToken);

	session.csrfToken = rawToken || csrfToken;
	updateSession(session);

	return session;
}

export function seedParityLoginFlowV1Session(
	jar: Record<string, string>,
	stateToken: string,
	csrfToken?: string,
): SessionData | null {
	const sessionId = jar[SESSION_COOKIE];

	if (!sessionId) {
		return null;
	}

	const session = getOrCreateSession(sessionId);

	if (csrfToken) {
		const rawToken = decryptCsrfToken(csrfToken);
		session.csrfToken = rawToken || csrfToken;
	}

	session.loginFlowV1StateToken = stateToken;
	session.loginToken = session.loginToken ?? `parity-login-token-${sessionId}`;
	updateSession(session);

	return session;
}

export function seedParityLoginFlowV2Session(
	jar: Record<string, string>,
	loginToken: string,
	stateToken: string,
	pollToken: string,
	clientName = 'parity-test-client',
): SessionData | null {
	const sessionId = jar[SESSION_COOKIE];

	if (!sessionId) {
		return null;
	}

	seedParityLoginFlowV2Store(pollToken, loginToken, clientName, true);

	const session = getOrCreateSession(sessionId);
	session.loginFlowV2Token = loginToken;
	session.loginFlowV2StateToken = stateToken;
	updateSession(session);

	return session;
}

export function seedParitySessionFromJar(jar: Record<string, string>, csrfToken: string): void {
	const session = seedParityGuestSessionFromJar(jar, csrfToken);

	if (!session) {
		return;
	}

	session.userId = jar[USERNAME_COOKIE] ?? 'admin';
	session.loginName = session.userId;
	updateSession(session);
}

/**
 * Make `last-password-confirm` stale for one session on both sides. `POST /login`
 * sets a fresh confirmation, so the Next.js server needs the parity-only route to
 * reach its own session store.
 */
export async function expireParityPasswordConfirmation(
	jar: Record<string, string>,
	baseUrl = getParityEnv().newBaseUrl,
): Promise<void> {
	const sessionId = jar[SESSION_COOKIE];

	if (!sessionId) {
		throw new Error('Cannot expire password confirmation without a session cookie');
	}

	expirePasswordConfirmation(sessionId);

	const response = await fetch(`${baseUrl}/api/parity/expire-password-confirm`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
		},
		body: JSON.stringify({ sessionId }),
	});

	if (!response.ok) {
		throw new Error(`Failed to expire password confirmation on the Next.js server (${response.status})`);
	}
}

export async function fetchParityCsrfToken(
	jar: Record<string, string>,
	baseUrl = getParityEnv().newBaseUrl,
): Promise<{ jar: Record<string, string>; token: string }> {
	const csrfResponse = await fetch(`${baseUrl}/csrftoken`, {
		redirect: 'manual',
		headers: {
			cookie: cookieJarToHeader(jar) ?? '',
		},
	});
	const nextJar = mergeResponseCookies(jar, csrfResponse);
	const csrfBody = await csrfResponse.json() as { token: string };

	return {
		jar: nextJar,
		token: csrfBody.token,
	};
}

export async function fetchParityGuestCsrfToken(
	baseUrl = getParityEnv().newBaseUrl,
): Promise<{ jar: Record<string, string>; token: string }> {
	const csrf = await fetchParityCsrfToken({}, baseUrl);

	seedParityGuestSessionFromJar(csrf.jar, csrf.token);

	return csrf;
}

export async function loginParitySessionWithCsrf(baseUrl = getParityEnv().newBaseUrl): Promise<{
	jar: Record<string, string>;
	csrfToken: string;
}> {
	const jar = await loginParitySession(baseUrl);
	const csrf = await fetchParityCsrfToken(jar, baseUrl);

	seedParitySessionFromJar(csrf.jar, csrf.token);

	return {
		jar: csrf.jar,
		csrfToken: csrf.token,
	};
}

export async function loginParitySession(baseUrl = getParityEnv().newBaseUrl): Promise<Record<string, string>> {
	let jar: Record<string, string> = {};

	const csrfResponse = await fetch(`${baseUrl}/csrftoken`, {
		redirect: 'manual',
		headers: {
			cookie: cookieJarToHeader(jar) ?? '',
		},
	});
	jar = mergeResponseCookies(jar, csrfResponse);
	const csrfBody = await csrfResponse.json() as { token: string };

	const loginResponse = await fetch(`${baseUrl}/login`, {
		method: 'POST',
		redirect: 'manual',
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
			cookie: cookieJarToHeader(jar) ?? '',
		},
		body: new URLSearchParams({
			user: 'admin',
			password: 'parity-test-password',
			requesttoken: csrfBody.token,
		}).toString(),
	});

	return mergeResponseCookies(jar, loginResponse);
}

export function basicAuthHeader(username: string, password: string): Record<string, string> {
	const encoded = Buffer.from(`${username}:${password}`).toString('base64');

	return {
		Authorization: `Basic ${encoded}`,
	};
}

export const OCS_JSON_HEADERS = {
	'OCS-APIRequest': 'true',
	Accept: 'application/json',
};

export const OCS_META_PATHS = [
	'ocs.meta.status',
	'ocs.meta.statuscode',
	'ocs.meta.message',
];

export function exAppAuthHeaders(): Record<string, string> {
	return {
		...OCS_JSON_HEADERS,
		Authorization: 'Bearer parity-ex-app',
	};
}
