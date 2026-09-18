import { parseCookieHeader, passesStrictCookieCheck, SESSION_COOKIE } from '@/src/server/auth/cookies';
import { isCsrfTokenValid } from '@/src/server/auth/csrf';
import { getSession } from '@/src/server/auth/session-store';
import { requireAuthenticatedUser } from '@/src/server/ocs/auth';
import { parseOcsVersion } from '@/src/server/ocs/respond';

const JSON_HEADERS = {
	'content-type': 'application/json; charset=utf-8',
};

function csrfFailure(): Response {
	return new Response(JSON.stringify({ message: 'CSRF check failed' }), {
		status: 412,
		headers: JSON_HEADERS,
	});
}

function hasBearerAuthorization(request: Request): boolean {
	const authorization = request.headers.get('authorization') ?? '';

	return /^Bearer\s+/i.test(authorization);
}

function hasOcsApiRequestHeader(request: Request): boolean {
	return Boolean(request.headers.get('ocs-apirequest'));
}

function extractRequestToken(request: Request, body?: Record<string, unknown>): string {
	const url = new URL(request.url);
	const queryToken = url.searchParams.get('requesttoken');

	if (queryToken) {
		return queryToken;
	}

	if (body && typeof body.requesttoken === 'string') {
		return body.requesttoken;
	}

	return request.headers.get('requesttoken') ?? '';
}

function enforceTemplatesCsrf(request: Request, body?: Record<string, unknown>): Response | null {
	if (hasOcsApiRequestHeader(request) || hasBearerAuthorization(request)) {
		return null;
	}

	const cookies = parseCookieHeader(request.headers.get('cookie'));
	const session = getSession(cookies[SESSION_COOKIE]);
	const token = extractRequestToken(request, body);

	if (!isCsrfTokenValid(session?.csrfToken, token)) {
		return csrfFailure();
	}

	return null;
}

export function requireTemplatesOcsUser(
	request: Request,
	body?: Record<string, unknown>,
): string | Response {
	const cookies = parseCookieHeader(request.headers.get('cookie'));

	if (!passesStrictCookieCheck(cookies, hasOcsApiRequestHeader(request))) {
		return new Response(null, {
			status: 303,
			headers: {
				location: '/',
			},
		});
	}

	const csrf = enforceTemplatesCsrf(request, body);

	if (csrf) {
		return csrf;
	}

	return requireAuthenticatedUser(request);
}

export function requireTemplatesOcsUserGet(request: Request): string | Response {
	parseOcsVersion(request);

	return requireAuthenticatedUser(request);
}
