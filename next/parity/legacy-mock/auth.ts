import { randomBytes } from 'node:crypto';
import {
	buildClearCookieHeaders,
	buildLoginCookieHeaders,
	buildSameSiteCookieHeaders,
	buildSessionCookieHeader,
	parseCookieHeader,
	passesStrictCookieCheck,
	SESSION_COOKIE,
} from '@/src/server/auth/cookies';
import { createCsrfToken, encryptCsrfToken, isCsrfTokenValid } from '@/src/server/auth/csrf';
import { checkPassword } from '@/src/server/auth/credentials';
import type { SessionData } from '@/src/server/auth/session-store';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';
import { snapshotResponse } from '../compare';

const mockSessions = new Map<string, SessionData>();

function createMockSession(): SessionData {
	const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 18)}`;
	const session: SessionData = { id };
	mockSessions.set(id, session);
	return session;
}

function getMockSession(sessionId: string | undefined): SessionData {
	if (sessionId && mockSessions.has(sessionId)) {
		return mockSessions.get(sessionId)!;
	}

	return createMockSession();
}

function parseCookiesFromOptions(options: ParityRequestOptions): Record<string, string> {
	return parseCookieHeader(options.headers?.cookie ?? options.headers?.Cookie ?? null);
}

function buildCookieHeader(cookies: Record<string, string>): string {
	return Object.entries(cookies)
		.map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
		.join('; ');
}

function mergeSetCookies(existing: Record<string, string>, setCookieHeaders: string[]): Record<string, string> {
	const merged = { ...existing };

	for (const header of setCookieHeaders) {
		const name = header.split('=')[0]?.trim();

		if (!name) {
			continue;
		}

		const valuePart = header.split(';')[0]?.split('=').slice(1).join('=') ?? '';

		if (header.includes('Expires=Thu, 01 Jan 1970')) {
			delete merged[name];
		} else {
			merged[name] = decodeURIComponent(valuePart);
		}
	}

	return merged;
}

function jsonResponse(
	status: number,
	body: unknown,
	extraHeaders: Record<string, string> = {},
	setCookies: string[] = [],
): ParityResponseSnapshot {
	const rawBody = JSON.stringify(body);
	const headers: Record<string, string> = {
		'content-type': 'application/json; charset=utf-8',
		...extraHeaders,
	};

	if (setCookies.length > 0) {
		headers['set-cookie'] = setCookies.join(', ');
	}

	return snapshotResponse(
		new Response(rawBody, { status, headers }),
		rawBody,
	);
}

function htmlResponse(status: number, html: string, setCookies: string[] = [], extraHeaders: Record<string, string> = {}): ParityResponseSnapshot {
	const headers: Record<string, string> = {
		'content-type': 'text/html; charset=UTF-8',
		...extraHeaders,
	};

	if (setCookies.length > 0) {
		headers['set-cookie'] = setCookies.join(', ');
	}

	return snapshotResponse(new Response(html, { status, headers }), html);
}

function redirectResponse(location: string, setCookies: string[] = [], extraHeaders: Record<string, string> = {}): ParityResponseSnapshot {
	const headers: Record<string, string> = {
		location,
		...extraHeaders,
	};

	if (setCookies.length > 0) {
		headers['set-cookie'] = setCookies.join(', ');
	}

	return snapshotResponse(new Response(null, { status: 303, headers }), '');
}

function ensureMockCsrfToken(session: SessionData): string {
	if (!session.csrfToken) {
		const token = createCsrfToken();
		session.csrfToken = token.raw;
		mockSessions.set(session.id, session);
		return token.encrypted;
	}

	return encryptCsrfToken(session.csrfToken);
}

export function handleLegacyMockAuth(pathname: string, options: ParityRequestOptions = {}): ParityResponseSnapshot | null {
	const method = (options.method ?? 'GET').toUpperCase();
	const requestCookies = parseCookiesFromOptions(options);
	const setCookies: string[] = [];

	if (requestCookies.nc_sameSiteCookielax !== 'true' || requestCookies.nc_sameSiteCookiestrict !== 'true') {
		setCookies.push(...buildSameSiteCookieHeaders());
	}

	if (pathname === '/csrftoken' && method === 'GET') {
		const session = getMockSession(requestCookies[SESSION_COOKIE]);
		const ocsApiRequest = Boolean(options.headers?.['ocs-apirequest'] ?? options.headers?.['OCS-APIRequest']);

		if (!requestCookies[SESSION_COOKIE]) {
			setCookies.push(buildSessionCookieHeader(session.id));
		}

		if (!passesStrictCookieCheck(requestCookies, ocsApiRequest)) {
			return jsonResponse(403, [], {}, setCookies);
		}

		return jsonResponse(200, { token: ensureMockCsrfToken(session) }, {}, setCookies);
	}

	if (pathname === '/login' && method === 'GET') {
		const session = getMockSession(requestCookies[SESSION_COOKIE]);

		if (!requestCookies[SESSION_COOKIE]) {
			setCookies.push(buildSessionCookieHeader(session.id));
		}

		if (session.userId) {
			return redirectResponse('http://127.0.0.1:3100/index.php/apps/dashboard/', setCookies);
		}

		return htmlResponse(200, '<!DOCTYPE html>\n<html>\n<head><title>Login – Nextcloud</title></head>\n<body id="body-login">\n<div id="login"></div>\n</body>\n</html>', setCookies);
	}

	if (pathname === '/login' && method === 'POST') {
		const session = getMockSession(requestCookies[SESSION_COOKIE]);
		const params = new URLSearchParams(options.body ?? '');
		const user = params.get('user') ?? '';
		const password = params.get('password') ?? '';
		const requesttoken = params.get('requesttoken');
		const rememberme = params.get('rememberme') === '1';
		const redirectUrl = params.get('redirect_url');
		const origin = options.headers?.origin ?? options.headers?.Origin;

		if (origin && origin !== 'http://127.0.0.1:3100') {
			session.loginMessages = [['invalidOrigin'], []];
			mockSessions.set(session.id, session);

			const location = `/login?user=${encodeURIComponent(user.trim())}&direct=1`;
			return redirectResponse(`http://127.0.0.1:3100${location}`, setCookies);
		}

		if (!isCsrfTokenValid(session.csrfToken, requesttoken ?? '')) {
			if (session.userId) {
				return redirectResponse('http://127.0.0.1:3100/index.php/apps/dashboard/', setCookies);
			}

			session.loginMessages = [['csrfCheckFailed'], []];
			mockSessions.set(session.id, session);

			const location = `/login?user=${encodeURIComponent(user.trim())}&direct=1`;
			return redirectResponse(`http://127.0.0.1:3100${location}`, setCookies);
		}

		const trimmedUser = user.trim();

		if (trimmedUser.length > 255) {
			const location = `/login?user=${encodeURIComponent(trimmedUser)}&direct=1`;
			return redirectResponse(`http://127.0.0.1:3100${location}`, setCookies);
		}

		if (!checkPassword(trimmedUser, password)) {
			session.loginMessages = [['invalidpassword'], []];
			mockSessions.set(session.id, session);

			const location = `/login?user=${encodeURIComponent(trimmedUser)}&direct=1`;
			return redirectResponse(`http://127.0.0.1:3100${location}`, setCookies);
		}

		const loginToken = randomBytes(32).toString('hex');
		session.userId = trimmedUser;
		session.loginName = trimmedUser;
		session.loginToken = loginToken;
		mockSessions.set(session.id, session);

		const maxAge = rememberme ? 60 * 60 * 24 * 15 : 60 * 60 * 24;
		const loginCookies = buildLoginCookieHeaders(trimmedUser, loginToken, session.id, maxAge);

		return redirectResponse('http://127.0.0.1:3100/index.php/apps/dashboard/', [...setCookies, ...loginCookies]);
	}

	if (pathname === '/logout' && method === 'GET') {
		const session = getMockSession(requestCookies[SESSION_COOKIE]);
		const extraHeaders: Record<string, string> = {};

		if (session.userId) {
			extraHeaders['x-user-id'] = session.userId;
		}

		mockSessions.delete(session.id);

		return redirectResponse('http://127.0.0.1:3100/login?clear=true', [...setCookies, ...buildClearCookieHeaders()], extraHeaders);
	}

	return null;
}

export function resetLegacyMockAuth(): void {
	mockSessions.clear();
}

export { buildCookieHeader, mergeSetCookies, parseCookiesFromOptions };
