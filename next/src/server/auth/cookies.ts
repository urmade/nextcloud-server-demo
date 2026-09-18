export const SESSION_COOKIE = 'nc_session_id';
export const TOKEN_COOKIE = 'nc_token';
export const USERNAME_COOKIE = 'nc_username';
export const SAME_SITE_LAX = 'nc_sameSiteCookielax';
export const SAME_SITE_STRICT = 'nc_sameSiteCookiestrict';

const SAME_SITE_EXPIRES = 'Fri, 31-Dec-2100 23:59:59 GMT';

export interface ParsedCookies {
	[ name: string ]: string;
}

export function parseCookieHeader(cookieHeader: string | null): ParsedCookies {
	if (!cookieHeader) {
		return {};
	}

	const cookies: ParsedCookies = {};

	for (const part of cookieHeader.split(';')) {
		const trimmed = part.trim();
		const separatorIndex = trimmed.indexOf('=');

		if (separatorIndex < 0) {
			continue;
		}

		const name = trimmed.slice(0, separatorIndex).trim();
		const value = trimmed.slice(separatorIndex + 1).trim();

		cookies[name] = decodeURIComponent(value);
	}

	return cookies;
}

export function cookieCheckRequired(cookies: ParsedCookies, ocsApiRequest: boolean): boolean {
	if (ocsApiRequest) {
		return false;
	}

	return cookies[SESSION_COOKIE] !== undefined || cookies[TOKEN_COOKIE] !== undefined;
}

export function passesLaxCookieCheck(cookies: ParsedCookies, ocsApiRequest: boolean): boolean {
	if (!cookieCheckRequired(cookies, ocsApiRequest)) {
		return true;
	}

	return cookies[SAME_SITE_LAX] === 'true';
}

export function passesStrictCookieCheck(cookies: ParsedCookies, ocsApiRequest: boolean): boolean {
	if (!cookieCheckRequired(cookies, ocsApiRequest)) {
		return true;
	}

	return cookies[SAME_SITE_STRICT] === 'true' && passesLaxCookieCheck(cookies, ocsApiRequest);
}

export function buildSameSiteCookieHeaders(): string[] {
	return [
		`${SAME_SITE_LAX}=true; Path=/; HttpOnly; Expires=${SAME_SITE_EXPIRES}; SameSite=Lax`,
		`${SAME_SITE_STRICT}=true; Path=/; HttpOnly; Expires=${SAME_SITE_EXPIRES}; SameSite=Strict`,
	];
}

export function buildSessionCookieHeader(sessionId: string, maxAgeSeconds = 60 * 60 * 24 * 15): string {
	return `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; Max-Age=${maxAgeSeconds}; SameSite=Lax`;
}

export function buildLoginCookieHeaders(username: string, token: string, sessionId: string, maxAgeSeconds = 60 * 60 * 24 * 15): string[] {
	return [
		`${USERNAME_COOKIE}=${encodeURIComponent(username)}; Path=/; HttpOnly; Max-Age=${maxAgeSeconds}; SameSite=Lax`,
		`${TOKEN_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Max-Age=${maxAgeSeconds}; SameSite=Lax`,
		buildSessionCookieHeader(sessionId, maxAgeSeconds),
	];
}

export function buildClearCookieHeaders(): string[] {
	const expired = 'Thu, 01 Jan 1970 00:00:00 GMT';

	return [
		`${USERNAME_COOKIE}=; Path=/; HttpOnly; Expires=${expired}`,
		`${TOKEN_COOKIE}=; Path=/; HttpOnly; Expires=${expired}`,
		`${SESSION_COOKIE}=; Path=/; HttpOnly; Expires=${expired}`,
	];
}

export function shouldSetSameSiteCookies(cookies: ParsedCookies): boolean {
	return cookies[SAME_SITE_LAX] !== 'true' || cookies[SAME_SITE_STRICT] !== 'true';
}
