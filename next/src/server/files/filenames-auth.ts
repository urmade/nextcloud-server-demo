import { parseCookieHeader, passesStrictCookieCheck, SESSION_COOKIE } from '@/src/server/auth/cookies';
import { isCsrfTokenValid } from '@/src/server/auth/csrf';
import { getSession } from '@/src/server/auth/session-store';
import { isAdminUserId } from '@/src/server/ocs/admin-auth';
import { resolveAuthenticatedUserId } from '@/src/server/ocs/auth';
import { getOcsHttpStatus, type OcsApiVersion } from '@/src/server/ocs/envelope';
import { ocsForbiddenResponse, parseOcsVersion } from '@/src/server/ocs/respond';

const JSON_HEADERS = {
	'content-type': 'application/json; charset=utf-8',
};

const NOT_LOGGED_IN_MESSAGE = 'Current user is not logged in';
const ADMIN_REQUIRED_MESSAGE = 'Logged in account must be an admin';

function redirectToRoot(): Response {
	return new Response(null, {
		status: 303,
		headers: {
			location: '/',
		},
	});
}

function csrfFailure(): Response {
	return new Response(JSON.stringify({ message: 'CSRF check failed' }), {
		status: 412,
		headers: JSON_HEADERS,
	});
}

function ocsUnauthorizedFilenames(ocsVersion: OcsApiVersion): Response {
	const envelope = {
		ocs: {
			meta: {
				status: 'failure' as const,
				statuscode: 997,
				message: NOT_LOGGED_IN_MESSAGE,
				...(ocsVersion === 1 ? { totalitems: '', itemsperpage: '' } : {}),
			},
			data: [] as [],
		},
	};

	return Response.json(envelope, {
		status: getOcsHttpStatus(ocsVersion, 997),
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

function enforceFilenamesCsrf(request: Request, body?: Record<string, unknown>): Response | null {
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

export function requireFilenamesAdminOcs(
	request: Request,
	body?: Record<string, unknown>,
): string | Response {
	const ocsVersion = parseOcsVersion(request);
	const cookies = parseCookieHeader(request.headers.get('cookie'));

	if (!passesStrictCookieCheck(cookies, hasOcsApiRequestHeader(request))) {
		return redirectToRoot();
	}

	const csrf = enforceFilenamesCsrf(request, body);

	if (csrf) {
		return csrf;
	}

	const userId = resolveAuthenticatedUserId(request);

	if (!userId) {
		return ocsUnauthorizedFilenames(ocsVersion);
	}

	if (!isAdminUserId(userId)) {
		return ocsForbiddenResponse(ocsVersion, ADMIN_REQUIRED_MESSAGE, []);
	}

	return userId;
}
