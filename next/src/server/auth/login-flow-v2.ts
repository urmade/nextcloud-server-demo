import { randomBytes } from 'node:crypto';
import { buildSessionCookieHeader, SESSION_COOKIE } from '@/src/server/auth/cookies';
import { isCsrfTokenValid } from '@/src/server/auth/csrf';
import { isPasswordConfirmationFresh } from '@/src/server/ocs/app-password-store';
import {
	appendSetCookieHeaders,
	isLoggedIn,
	type ResolvedSession,
} from '@/src/server/auth/session';
import { updateSession } from '@/src/server/auth/session-store';
import {
	completeLoginFlow,
	createLoginFlowTokens,
	getLoginFlowByLoginToken,
	LoginFlowV2NotFoundError,
	pollLoginFlow,
	startLoginFlow,
} from '@/src/server/auth/login-flow-v2-store';

const STATE_TOKEN_LENGTH = 64;
const STATE_TOKEN_CHARSET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function jsonResponse(body: unknown, status = 200, cookieHeaders: string[] = []): Response {
	const headers = new Headers({
		'content-type': 'application/json; charset=utf-8',
	});

	appendSetCookieHeaders(headers, cookieHeaders);

	return new Response(JSON.stringify(body), { status, headers });
}

function htmlResponse(html: string, status = 200, cookieHeaders: string[] = []): Response {
	const headers = new Headers({
		'content-type': 'text/html; charset=UTF-8',
	});

	appendSetCookieHeaders(headers, cookieHeaders);

	return new Response(html, { status, headers });
}

function redirectResponse(location: string, cookieHeaders: string[] = []): Response {
	const headers = new Headers({ location });

	appendSetCookieHeaders(headers, cookieHeaders);

	return new Response(null, { status: 303, headers });
}

function forbiddenHtml(message: string, cookieHeaders: string[] = []): Response {
	return htmlResponse(`<!DOCTYPE html><html><body><p>${message}</p></body></html>`, 403, cookieHeaders);
}

function generateStateToken(): string {
	const bytes = randomBytes(STATE_TOKEN_LENGTH);
	let token = '';

	for (let index = 0; index < STATE_TOKEN_LENGTH; index += 1) {
		token += STATE_TOKEN_CHARSET[bytes[index] % STATE_TOKEN_CHARSET.length];
	}

	return token;
}

function getServerPath(request: Request): string {
	const url = new URL(request.url);
	const pathname = url.pathname;

	if (pathname.includes('/index.php')) {
		return `${url.origin}${pathname.slice(0, pathname.indexOf('/index.php'))}`;
	}

	if (pathname.includes('/login/v2')) {
		return `${url.origin}${pathname.slice(0, pathname.indexOf('/login/v2'))}`;
	}

	return url.origin;
}

function buildPollEndpoint(request: Request): string {
	const url = new URL(request.url);
	url.pathname = '/login/v2/poll';
	url.search = '';

	return url.toString();
}

function buildLoginLandingUrl(request: Request, loginToken: string): string {
	const url = new URL(request.url);
	url.pathname = `/login/v2/flow/${loginToken}`;
	url.search = '';

	return url.toString();
}

function buildGrantPageUrl(request: Request, stateToken: string, user = '', direct = 0): string {
	const url = new URL(request.url);
	url.pathname = '/login/v2/grant';
	url.search = '';

	if (user) {
		url.searchParams.set('user', user);
	}

	if (direct === 1) {
		url.searchParams.set('direct', '1');
	}

	url.searchParams.set('stateToken', stateToken);

	return url.toString();
}

function ensureSessionCookie(resolved: ResolvedSession, cookieHeaders: string[]): void {
	if (resolved.isNew) {
		cookieHeaders.push(buildSessionCookieHeader(resolved.session.id));
	}
}

function parseStateToken(request: Request, body?: string): string | null {
	const url = new URL(request.url);
	const queryToken = url.searchParams.get('stateToken');

	if (queryToken) {
		return queryToken;
	}

	if (body) {
		const params = new URLSearchParams(body);
		const formToken = params.get('stateToken');

		if (formToken) {
			return formToken;
		}
	}

	return null;
}

function parseRequestToken(request: Request, body?: string): string | null {
	if (body) {
		const params = new URLSearchParams(body);
		const formToken = params.get('requesttoken');

		if (formToken) {
			return formToken;
		}
	}

	const url = new URL(request.url);
	const queryToken = url.searchParams.get('requesttoken');

	if (queryToken) {
		return queryToken;
	}

	return request.headers.get('requesttoken');
}

function isValidStateToken(sessionStateToken: string | undefined, stateToken: string): boolean {
	if (!sessionStateToken) {
		return false;
	}

	return sessionStateToken === stateToken;
}

function renderAuthPickerPage(clientName: string, grantUrl: string): string {
	return `<!DOCTYPE html>
<html>
<head><title>Login flow – Nextcloud</title></head>
<body id="body-login">
<div id="core-loginflow" data-login-flow="auth" data-client="${clientName}" data-grant-url="${grantUrl}"></div>
</body>
</html>`;
}

function renderGrantPage(userId: string, clientName: string, stateToken: string): string {
	return `<!DOCTYPE html>
<html>
<head><title>Grant access – Nextcloud</title></head>
<body id="body-login">
<div id="core-loginflow" data-login-flow="grant" data-user="${userId}" data-client="${clientName}" data-state-token="${stateToken}"></div>
</body>
</html>`;
}

function renderDonePage(): string {
	return `<!DOCTYPE html>
<html>
<head><title>Login flow complete – Nextcloud</title></head>
<body id="body-login">
<div id="core-loginflow" data-login-flow="done"></div>
</body>
</html>`;
}

export function handleLoginFlowV2Init(request: Request, resolved: ResolvedSession): Response {
	const cookieHeaders = [...resolved.sameSiteCookieHeaders];
	ensureSessionCookie(resolved, cookieHeaders);

	const userAgent = request.headers.get('user-agent') ?? '';
	const tokens = createLoginFlowTokens(userAgent);

	return jsonResponse({
		poll: {
			token: tokens.pollToken,
			endpoint: buildPollEndpoint(request),
		},
		login: buildLoginLandingUrl(request, tokens.loginToken),
	}, 200, cookieHeaders);
}

export async function handleLoginFlowV2Poll(request: Request, resolved: ResolvedSession): Promise<Response> {
	const cookieHeaders = [...resolved.sameSiteCookieHeaders];
	ensureSessionCookie(resolved, cookieHeaders);

	let pollToken: string | null = null;

	try {
		const body = await request.json() as { token?: string };
		pollToken = body.token ?? null;
	} catch {
		pollToken = null;
	}

	if (!pollToken) {
		return jsonResponse([], 404, cookieHeaders);
	}

	try {
		const credentials = pollLoginFlow(pollToken);

		return jsonResponse(credentials, 200, cookieHeaders);
	} catch (error) {
		if (error instanceof LoginFlowV2NotFoundError) {
			return jsonResponse([], 404, cookieHeaders);
		}

		throw error;
	}
}

export function handleLoginFlowV2Landing(
	request: Request,
	resolved: ResolvedSession,
	loginToken: string,
	user = '',
	direct = 0,
): Response {
	const cookieHeaders = [...resolved.sameSiteCookieHeaders];
	ensureSessionCookie(resolved, cookieHeaders);

	if (!startLoginFlow(loginToken)) {
		return forbiddenHtml('Your login token is invalid or has expired', cookieHeaders);
	}

	resolved.session.loginFlowV2Token = loginToken;
	updateSession(resolved.session);

	const url = new URL(request.url);
	url.pathname = '/login/v2/flow';

	if (user) {
		url.searchParams.set('user', user);
	}

	if (direct === 1) {
		url.searchParams.set('direct', '1');
	}

	return redirectResponse(url.toString(), cookieHeaders);
}

export function handleLoginFlowV2ShowAuthPicker(
	request: Request,
	resolved: ResolvedSession,
	user = '',
	direct = 0,
): Response {
	const cookieHeaders = [...resolved.sameSiteCookieHeaders];
	ensureSessionCookie(resolved, cookieHeaders);

	const loginToken = resolved.session.loginFlowV2Token;

	if (!loginToken) {
		return forbiddenHtml('Your login token is invalid or has expired', cookieHeaders);
	}

	try {
		const flow = getLoginFlowByLoginToken(loginToken);
		const stateToken = generateStateToken();
		resolved.session.loginFlowV2StateToken = stateToken;
		updateSession(resolved.session);

		const grantUrl = buildGrantPageUrl(request, stateToken, user, direct);

		return htmlResponse(renderAuthPickerPage(flow.clientName, grantUrl), 200, cookieHeaders);
	} catch (error) {
		if (error instanceof LoginFlowV2NotFoundError) {
			return forbiddenHtml('Your login token is invalid or has expired', cookieHeaders);
		}

		throw error;
	}
}

export function handleLoginFlowV2GrantPage(
	request: Request,
	resolved: ResolvedSession,
	stateToken: string | null,
): Response {
	const cookieHeaders = [...resolved.sameSiteCookieHeaders];
	ensureSessionCookie(resolved, cookieHeaders);

	if (!isLoggedIn(resolved.session)) {
		return forbiddenHtml('Current user is not logged in', cookieHeaders);
	}

	if (stateToken === null) {
		return forbiddenHtml('State token missing', cookieHeaders);
	}

	if (!isValidStateToken(resolved.session.loginFlowV2StateToken, stateToken)) {
		return forbiddenHtml('State token does not match', cookieHeaders);
	}

	const loginToken = resolved.session.loginFlowV2Token;

	if (!loginToken) {
		return forbiddenHtml('Your login token is invalid or has expired', cookieHeaders);
	}

	try {
		const flow = getLoginFlowByLoginToken(loginToken);
		const userId = resolved.session.userId ?? '';

		return htmlResponse(renderGrantPage(userId, flow.clientName, stateToken), 200, cookieHeaders);
	} catch (error) {
		if (error instanceof LoginFlowV2NotFoundError) {
			return forbiddenHtml('Your login token is invalid or has expired', cookieHeaders);
		}

		throw error;
	}
}

export function handleLoginFlowV2GrantPost(
	request: Request,
	resolved: ResolvedSession,
	body: string,
): Response {
	const cookieHeaders = [...resolved.sameSiteCookieHeaders];
	ensureSessionCookie(resolved, cookieHeaders);

	if (!isLoggedIn(resolved.session)) {
		return forbiddenHtml('Current user is not logged in', cookieHeaders);
	}

	const stateToken = parseStateToken(request, body);

	if (stateToken === null) {
		return forbiddenHtml('State token missing', cookieHeaders);
	}

	if (!isValidStateToken(resolved.session.loginFlowV2StateToken, stateToken)) {
		return forbiddenHtml('State token does not match', cookieHeaders);
	}

	const requestToken = parseRequestToken(request, body);

	if (!isCsrfTokenValid(resolved.session.csrfToken, requestToken ?? '')) {
		return forbiddenHtml('CSRF check failed', cookieHeaders);
	}

	if (!isPasswordConfirmationFresh(resolved.session.lastPasswordConfirm)) {
		const headers = new Headers({
			'content-type': 'text/html; charset=UTF-8',
			'x-nc-auth-notconfirmed': 'true',
		});

		appendSetCookieHeaders(headers, cookieHeaders);

		return new Response('<!DOCTYPE html><html><body><p>Password confirmation is required</p></body></html>', {
			status: 403,
			headers,
		});
	}

	const loginToken = resolved.session.loginFlowV2Token;

	if (!loginToken) {
		return forbiddenHtml('Your login token is invalid or has expired', cookieHeaders);
	}

	try {
		getLoginFlowByLoginToken(loginToken);
	} catch (error) {
		if (error instanceof LoginFlowV2NotFoundError) {
			return forbiddenHtml('Your login token is invalid or has expired', cookieHeaders);
		}

		throw error;
	}

	const userId = resolved.session.userId ?? '';
	const loginName = resolved.session.loginName ?? userId;
	const userAgent = request.headers.get('user-agent') ?? '';
	const completed = completeLoginFlow(loginToken, getServerPath(request), userId, loginName, userAgent);

	resolved.session.loginFlowV2Token = undefined;
	resolved.session.loginFlowV2StateToken = undefined;
	updateSession(resolved.session);

	if (!completed) {
		return forbiddenHtml('Could not complete login', cookieHeaders);
	}

	return htmlResponse(renderDonePage(), 200, cookieHeaders);
}
