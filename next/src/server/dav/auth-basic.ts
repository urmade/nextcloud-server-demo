import { isValidBasicAuth, parseBasicAuthHeader } from '@/src/server/auth/basic';
import { parseCookieHeader, SESSION_COOKIE, USERNAME_COOKIE } from '@/src/server/auth/cookies';
import { getSession } from '@/src/server/auth/session-store';
import { buildSabreErrorXml } from './xml';

const DEFAULT_REALM = process.env.NC_DAV_REALM?.trim() || 'Nextcloud';

export function resolveDavUserId(request: Request): string | null {
	const credentials = parseBasicAuthHeader(request.headers.get('authorization'));

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

export function davUnauthorizedResponse(message = 'No basic authentication headers were found'): Response {
	const body = buildSabreErrorXml('Sabre\\DAV\\Exception\\NotAuthenticated', message);

	return new Response(body, {
		status: 401,
		headers: {
			'content-type': 'application/xml; charset=utf-8',
			'www-authenticate': `Basic realm="${DEFAULT_REALM}"`,
		},
	});
}
