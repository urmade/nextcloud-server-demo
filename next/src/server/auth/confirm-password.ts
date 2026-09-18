import { checkPassword } from '@/src/server/auth/credentials';
import { parseCookieHeader, SESSION_COOKIE } from '@/src/server/auth/cookies';
import { appendSetCookieHeaders, resolveSession } from '@/src/server/auth/session';
import { getSession, updateSession } from '@/src/server/auth/session-store';

const NOT_LOGGED_IN_MESSAGE = 'Current user is not logged in';

function acceptsHtml(request: Request): boolean {
	const accept = request.headers.get('accept') ?? '';

	return accept.toLowerCase().includes('html');
}

function buildLoginRedirect(request: Request, cookieHeaders: string[]): Response {
	const requestUrl = new URL(request.url);
	const loginUrl = new URL('/login', requestUrl.origin);
	loginUrl.searchParams.set('redirect_url', `${requestUrl.pathname}${requestUrl.search}`);

	const headers = new Headers({
		location: loginUrl.toString(),
	});

	appendSetCookieHeaders(headers, cookieHeaders);

	return new Response(null, {
		status: 303,
		headers,
	});
}

function jsonResponse(status: number, body: unknown, cookieHeaders: string[] = []): Response {
	const headers = new Headers({
		'content-type': 'application/json; charset=utf-8',
	});

	appendSetCookieHeaders(headers, cookieHeaders);

	return new Response(JSON.stringify(body), {
		status,
		headers,
	});
}

function emptyResponse(status: number, cookieHeaders: string[] = []): Response {
	const headers = new Headers();

	appendSetCookieHeaders(headers, cookieHeaders);

	return new Response(null, {
		status,
		headers,
	});
}

export function parseConfirmPasswordBody(request: Request, body: string): string | null {
	const contentType = request.headers.get('content-type') ?? '';

	if (contentType.includes('application/json')) {
		try {
			const parsed = JSON.parse(body) as { password?: unknown };

			if (parsed.password === undefined || parsed.password === null) {
				return null;
			}

			return String(parsed.password);
		} catch {
			return null;
		}
	}

	const params = new URLSearchParams(body);
	const password = params.get('password');

	if (password === null) {
		return null;
	}

	return password;
}

export function handleConfirmPassword(request: Request, body: string): Response {
	const resolved = resolveSession(request);
	const cookies = parseCookieHeader(request.headers.get('cookie'));
	const session = getSession(cookies[SESSION_COOKIE]) ?? resolved.session;
	const cookieHeaders = [
		...resolved.sameSiteCookieHeaders,
	];

	if (!session?.userId) {
		if (acceptsHtml(request)) {
			return buildLoginRedirect(request, cookieHeaders);
		}

		return jsonResponse(401, { message: NOT_LOGGED_IN_MESSAGE }, cookieHeaders);
	}

	const password = parseConfirmPasswordBody(request, body);

	if (password === null) {
		return emptyResponse(400, cookieHeaders);
	}

	const loginName = session.loginName ?? session.userId;

	if (!checkPassword(loginName, password)) {
		return jsonResponse(403, [], cookieHeaders);
	}

	const confirmTimestamp = Math.floor(Date.now() / 1000);
	session.lastPasswordConfirm = confirmTimestamp;
	updateSession(session);

	return jsonResponse(200, { lastLogin: confirmTimestamp }, cookieHeaders);
}
