import { isValidBasicAuth, parseBasicAuthHeader } from '@/src/server/auth/basic';
import { parseCookieHeader, SESSION_COOKIE, USERNAME_COOKIE } from '@/src/server/auth/cookies';
import { getSession } from '@/src/server/auth/session-store';
import { isAppPasswordTokenFormat, lookupAppPasswordToken } from '@/src/server/ocs/app-password-store';
import { ocsUnauthorizedResponse, parseOcsVersion } from '@/src/server/ocs/respond';

export function resolveAuthenticatedUserId(request: Request): string | null {
	const credentials = parseBasicAuthHeader(request.headers.get('authorization'));

	if (credentials && isAppPasswordTokenFormat(credentials.password)) {
		const stored = lookupAppPasswordToken(credentials.password);

		if (stored && stored.loginName === credentials.username) {
			return stored.userId;
		}
	}

	if (isValidBasicAuth(credentials)) {
		return credentials!.username;
	}

	const cookies = parseCookieHeader(request.headers.get('cookie'));
	const session = getSession(cookies[SESSION_COOKIE]);

	if (session?.userId) {
		return session.userId;
	}

	if (cookies[USERNAME_COOKIE]) {
		return cookies[USERNAME_COOKIE];
	}

	return null;
}

export function requireAuthenticatedUser(request: Request): string | Response {
	const userId = resolveAuthenticatedUserId(request);

	if (!userId) {
		return ocsUnauthorizedResponse(parseOcsVersion(request));
	}

	return userId;
}
