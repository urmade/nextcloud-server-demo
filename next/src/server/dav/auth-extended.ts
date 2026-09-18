import { isValidBasicAuth, parseBasicAuthHeader } from '@/src/server/auth/basic';
import { parseCookieHeader, SESSION_COOKIE, USERNAME_COOKIE } from '@/src/server/auth/cookies';
import { getSession } from '@/src/server/auth/session-store';
import { isAppPasswordTokenFormat, lookupAppPasswordToken } from '@/src/server/ocs/app-password-store';
import { buildSabreErrorXml } from './xml';

export { davUnauthorizedResponse } from './auth-basic';

const DEFAULT_REALM = process.env.NC_DAV_REALM?.trim() || 'Nextcloud';

function parseBearerToken(authorizationHeader: string | null): string | null {
	if (!authorizationHeader) {
		return null;
	}

	const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());

	return match?.[1] ?? null;
}

export function resolveDavUserIdWithAppPasswords(request: Request): string | null {
	const authorization = request.headers.get('authorization');
	const bearerToken = parseBearerToken(authorization);

	if (bearerToken && isAppPasswordTokenFormat(bearerToken)) {
		const stored = lookupAppPasswordToken(bearerToken);

		if (stored) {
			return stored.userId;
		}
	}

	const credentials = parseBasicAuthHeader(authorization);

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

export function davUnauthorizedResponseWithRealm(message = 'No basic authentication headers were found'): Response {
	const body = buildSabreErrorXml('Sabre\\DAV\\Exception\\NotAuthenticated', message);

	return new Response(body, {
		status: 401,
		headers: {
			'content-type': 'application/xml; charset=utf-8',
			'www-authenticate': `Basic realm="${DEFAULT_REALM}"`,
		},
	});
}
