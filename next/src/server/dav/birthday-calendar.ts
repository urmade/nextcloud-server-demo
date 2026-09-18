import { isCsrfTokenValid } from '@/src/server/auth/csrf';
import { parseCookieHeader, SESSION_COOKIE } from '@/src/server/auth/cookies';
import { getSession } from '@/src/server/auth/session-store';
import { isAdminUserId } from '@/src/server/ocs/admin-auth';
import { resolveAuthenticatedUserId } from '@/src/server/ocs/auth';
import {
	disableBirthdayCalendar,
	enableBirthdayCalendar,
} from './birthday-calendar-store';

const JSON_HEADERS = {
	'content-type': 'application/json; charset=utf-8',
};

const HTML_CONTENT_TYPE = 'text/html; charset=UTF-8';

const NOT_LOGGED_IN_MESSAGE = 'Current user is not logged in';
const ADMIN_REQUIRED_MESSAGE = 'Logged in account must be an admin, a sub admin or gotten special right to access this setting';

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: JSON_HEADERS,
	});
}

function acceptsHtml(request: Request): boolean {
	return (request.headers.get('accept') ?? '').toLowerCase().includes('html');
}

function buildGuestForbiddenHtml(message: string): string {
	return `<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8" />
	<title>Access forbidden</title>
</head>
<body class="guest">
<div class="body-login-container update">
	<h2>Access forbidden</h2>
	<p class="hint">${message}</p>
</div>
</body>
</html>`;
}

function unauthenticatedResponse(request: Request): Response {
	if (acceptsHtml(request)) {
		const requestUrl = new URL(request.url);
		const redirectUrl = encodeURIComponent(`${requestUrl.pathname}${requestUrl.search}`);

		return new Response(null, {
			status: 303,
			headers: {
				location: `/login?redirect_url=${redirectUrl}`,
			},
		});
	}

	return jsonResponse(401, { message: NOT_LOGGED_IN_MESSAGE });
}

function forbiddenResponse(request: Request): Response {
	if (acceptsHtml(request)) {
		return new Response(buildGuestForbiddenHtml(ADMIN_REQUIRED_MESSAGE), {
			status: 403,
			headers: {
				'content-type': HTML_CONTENT_TYPE,
			},
		});
	}

	return jsonResponse(403, { message: ADMIN_REQUIRED_MESSAGE });
}

function csrfFailedResponse(): Response {
	return jsonResponse(412, { message: 'CSRF check failed' });
}

function successResponse(): Response {
	return jsonResponse(200, []);
}

function extractRequestToken(request: Request): string {
	const url = new URL(request.url);
	const queryToken = url.searchParams.get('requesttoken');

	if (queryToken) {
		return queryToken;
	}

	const headerToken = request.headers.get('requesttoken');

	return headerToken ?? '';
}

function requireBirthdayCalendarAdmin(request: Request): string | Response {
	const userId = resolveAuthenticatedUserId(request);

	if (!userId) {
		return unauthenticatedResponse(request);
	}

	const cookies = parseCookieHeader(request.headers.get('cookie'));
	const session = getSession(cookies[SESSION_COOKIE]);
	const token = extractRequestToken(request);

	if (!isCsrfTokenValid(session?.csrfToken, token)) {
		return csrfFailedResponse();
	}

	if (!isAdminUserId(userId)) {
		return forbiddenResponse(request);
	}

	return userId;
}

export function handleEnableBirthdayCalendar(request: Request): Response {
	const auth = requireBirthdayCalendarAdmin(request);

	if (auth instanceof Response) {
		return auth;
	}

	enableBirthdayCalendar();

	return successResponse();
}

export function handleDisableBirthdayCalendar(request: Request): Response {
	const auth = requireBirthdayCalendarAdmin(request);

	if (auth instanceof Response) {
		return auth;
	}

	disableBirthdayCalendar();

	return successResponse();
}
