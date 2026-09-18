import {
	buildSameSiteCookieHeaders,
	parseCookieHeader,
	SESSION_COOKIE,
	shouldSetSameSiteCookies,
} from '@/src/server/auth/cookies';
import { createCsrfToken, encryptCsrfToken } from '@/src/server/auth/csrf';
import {
	createSession,
	getOrCreateSession,
	type SessionData,
	updateSession,
} from '@/src/server/auth/session-store';

export interface ResolvedSession {
	session: SessionData;
	isNew: boolean;
	sameSiteCookieHeaders: string[];
}

export function resolveSession(request: Request): ResolvedSession {
	const cookies = parseCookieHeader(request.headers.get('cookie'));
	const existingId = cookies[SESSION_COOKIE];
	const isNew = existingId === undefined;
	const session = getOrCreateSession(existingId);
	const sameSiteCookieHeaders = shouldSetSameSiteCookies(cookies) ? buildSameSiteCookieHeaders() : [];

	if (isNew) {
		updateSession(session);
	}

	return {
		session,
		isNew,
		sameSiteCookieHeaders,
	};
}

export function ensureCsrfToken(session: SessionData): string {
	if (!session.csrfToken) {
		const token = createCsrfToken();
		session.csrfToken = token.raw;
		updateSession(session);
		return token.encrypted;
	}

	return encryptCsrfToken(session.csrfToken);
}

export function isLoggedIn(session: SessionData): boolean {
	return session.userId !== undefined;
}

export function getDefaultPageUrl(request: Request): string {
	const url = new URL(request.url);
	return `${url.origin}/index.php/apps/dashboard/`;
}

export function appendSetCookieHeaders(headers: Headers, cookieHeaders: string[]): void {
	for (const cookie of cookieHeaders) {
		headers.append('set-cookie', cookie);
	}
}

export function createSessionCookieForNew(session: SessionData): string {
	return `${SESSION_COOKIE}=${encodeURIComponent(session.id)}; Path=/; HttpOnly; SameSite=Lax`;
}
