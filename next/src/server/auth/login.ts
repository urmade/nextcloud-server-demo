import { randomBytes } from 'node:crypto';
import {
	buildLoginCookieHeaders,
	buildSessionCookieHeader,
	parseCookieHeader,
	passesStrictCookieCheck,
	SESSION_COOKIE,
} from '@/src/server/auth/cookies';
import { isCsrfTokenValid } from '@/src/server/auth/csrf';
import { checkPassword, isUserEnabled } from '@/src/server/auth/credentials';
import {
	appendSetCookieHeaders,
	getDefaultPageUrl,
	isLoggedIn,
	type ResolvedSession,
} from '@/src/server/auth/session';
import { updateSession } from '@/src/server/auth/session-store';

export const LOGIN_MSG_INVALIDPASSWORD = 'invalidpassword';
export const LOGIN_MSG_CSRFCHECKFAILED = 'csrfCheckFailed';
export const LOGIN_MSG_INVALID_ORIGIN = 'invalidOrigin';
export const LOGIN_MSG_USERDISABLED = 'userdisabled';

export interface LoginFormData {
	user: string;
	password: string;
	rememberme: boolean;
	redirect_url: string | null;
	requesttoken: string | null;
}

export function parseLoginFormData(request: Request, body: string): LoginFormData {
	const contentType = request.headers.get('content-type') ?? '';

	if (contentType.includes('application/x-www-form-urlencoded')) {
		const params = new URLSearchParams(body);

		return {
			user: params.get('user') ?? '',
			password: params.get('password') ?? '',
			rememberme: params.get('rememberme') === '1' || params.get('rememberme') === 'true',
			redirect_url: params.get('redirect_url'),
			requesttoken: params.get('requesttoken'),
		};
	}

	return {
		user: '',
		password: '',
		rememberme: false,
		redirect_url: null,
		requesttoken: null,
	};
}

function isTrustedOrigin(origin: string | null, requestUrl: string): boolean {
	if (!origin) {
		return true;
	}

	try {
		const requestOrigin = new URL(requestUrl).origin;
		return origin === requestOrigin;
	} catch {
		return false;
	}
}

function extractRequestToken(request: Request, formToken: string | null): string | null {
	if (formToken) {
		return formToken;
	}

	const url = new URL(request.url);
	const queryToken = url.searchParams.get('requesttoken');

	if (queryToken) {
		return queryToken;
	}

	return request.headers.get('requesttoken');
}

function passesCsrfCheck(request: Request, session: ResolvedSession['session'], formToken: string | null): boolean {
	if (request.headers.get('ocs-apirequest')) {
		return true;
	}

	const cookies = parseCookieHeader(request.headers.get('cookie'));

	if (!passesStrictCookieCheck(cookies, Boolean(request.headers.get('ocs-apirequest')))) {
		return false;
	}

	const token = extractRequestToken(request, formToken);

	return isCsrfTokenValid(session.csrfToken, token ?? '');
}

function buildLoginFailedUrl(request: Request, user: string, redirectUrl: string | null): string {
	const url = new URL('/login', request.url);
	const trimmedUser = user.trim();

	if (trimmedUser) {
		url.searchParams.set('user', trimmedUser);
	}

	url.searchParams.set('direct', '1');

	if (redirectUrl) {
		url.searchParams.set('redirect_url', redirectUrl);
	}

	return url.toString();
}

function buildRedirectResponse(
	request: Request,
	location: string,
	cookieHeaders: string[],
	extraHeaders: Record<string, string> = {},
): Response {
	const headers = new Headers({
		location,
		...extraHeaders,
	});

	appendSetCookieHeaders(headers, cookieHeaders);

	return new Response(null, {
		status: 303,
		headers,
	});
}

function generateLoginToken(): string {
	return randomBytes(32).toString('hex');
}

export function handleLoginPost(request: Request, resolved: ResolvedSession, body: string): Response {
	const form = parseLoginFormData(request, body);
	const { session, sameSiteCookieHeaders } = resolved;
	const cookies = parseCookieHeader(request.headers.get('cookie'));
	const cookieHeaders = [...sameSiteCookieHeaders];

	if (!cookies[SESSION_COOKIE]) {
		cookieHeaders.push(buildSessionCookieHeader(session.id));
	}

	const origin = request.headers.get('origin');

	if (!isTrustedOrigin(origin, request.url)) {
		session.loginMessages = [[LOGIN_MSG_INVALID_ORIGIN], []];
		updateSession(session);

		return buildRedirectResponse(
			request,
			buildLoginFailedUrl(request, form.user, form.redirect_url),
			cookieHeaders,
		);
	}

	if (!passesCsrfCheck(request, session, form.requesttoken)) {
		if (isLoggedIn(session)) {
			return buildRedirectResponse(
				request,
				form.redirect_url && !form.redirect_url.includes('@')
					? new URL(form.redirect_url, request.url).toString()
					: getDefaultPageUrl(request),
				cookieHeaders,
			);
		}

		session.loginMessages = [[LOGIN_MSG_CSRFCHECKFAILED], []];
		updateSession(session);

		return buildRedirectResponse(
			request,
			buildLoginFailedUrl(request, form.user, form.redirect_url),
			cookieHeaders,
		);
	}

	const trimmedUser = form.user.trim();

	if (trimmedUser.length > 255) {
		session.loginMessages = [['Unsupported email length (>255)'], []];
		updateSession(session);

		return buildRedirectResponse(
			request,
			buildLoginFailedUrl(request, trimmedUser, form.redirect_url),
			cookieHeaders,
		);
	}

	if (!checkPassword(trimmedUser, form.password)) {
		session.loginMessages = [[LOGIN_MSG_INVALIDPASSWORD], []];
		updateSession(session);

		return buildRedirectResponse(
			request,
			buildLoginFailedUrl(request, trimmedUser, form.redirect_url),
			cookieHeaders,
		);
	}

	if (!isUserEnabled(trimmedUser)) {
		session.loginMessages = [[LOGIN_MSG_USERDISABLED], []];
		updateSession(session);

		return buildRedirectResponse(
			request,
			buildLoginFailedUrl(request, trimmedUser, form.redirect_url),
			cookieHeaders,
		);
	}

	const loginToken = generateLoginToken();
	session.userId = trimmedUser;
	session.loginName = trimmedUser;
	session.loginToken = loginToken;
	session.loginMessages = undefined;
	session.lastPasswordConfirm = Math.floor(Date.now() / 1000);
	updateSession(session);

	const maxAge = form.rememberme ? 60 * 60 * 24 * 15 : 60 * 60 * 24;
	const loginCookies = buildLoginCookieHeaders(trimmedUser, loginToken, session.id, maxAge);

	return buildRedirectResponse(
		request,
		getDefaultPageUrl(request),
		[...cookieHeaders, ...loginCookies],
	);
}

export function renderLoginPage(): string {
	return `<!DOCTYPE html>
<html>
<head><title>Login – Nextcloud</title></head>
<body id="body-login">
<div id="login"></div>
</body>
</html>`;
}

export function handleLoginGet(request: Request, resolved: ResolvedSession): Response {
	const { session, sameSiteCookieHeaders } = resolved;
	const headers = new Headers({
		'content-type': 'text/html; charset=UTF-8',
		'cache-control': 'no-cache, no-store, must-revalidate',
	});

	appendSetCookieHeaders(headers, sameSiteCookieHeaders);

	if (resolved.isNew) {
		appendSetCookieHeaders(headers, [buildSessionCookieHeader(session.id)]);
	}

	if (isLoggedIn(session)) {
		headers.set('location', getDefaultPageUrl(request));

		return new Response(null, {
			status: 303,
			headers,
		});
	}

	return new Response(renderLoginPage(), {
		status: 200,
		headers,
	});
}
