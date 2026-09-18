import { randomBytes } from 'node:crypto';
import { buildSessionCookieHeader } from '@/src/server/auth/cookies';
import { isCsrfTokenValid } from '@/src/server/auth/csrf';
import {
	generateAppPasswordToken,
	isPasswordConfirmationFresh,
	lookupAppPasswordToken,
	storeAppPasswordToken,
} from '@/src/server/ocs/app-password-store';
import {
	appendSetCookieHeaders,
	isLoggedIn,
	type ResolvedSession,
} from '@/src/server/auth/session';
import { updateSession } from '@/src/server/auth/session-store';

const STATE_TOKEN_LENGTH = 64;
const STATE_TOKEN_CHARSET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function htmlResponse(html: string, status = 200, cookieHeaders: string[] = [], extraHeaders: Record<string, string> = {}): Response {
	const headers = new Headers({
		'content-type': 'text/html; charset=UTF-8',
		...extraHeaders,
	});

	appendSetCookieHeaders(headers, cookieHeaders);

	return new Response(html, { status, headers });
}

function redirectResponse(location: string, cookieHeaders: string[] = []): Response {
	const headers = new Headers({ location });

	appendSetCookieHeaders(headers, cookieHeaders);

	return new Response(null, { status: 303, headers });
}

function emptyForbiddenResponse(cookieHeaders: string[] = []): Response {
	const headers = new Headers();

	appendSetCookieHeaders(headers, cookieHeaders);

	return new Response(null, { status: 403, headers });
}

function forbiddenHtml(message: string, cookieHeaders: string[] = [], extraHeaders: Record<string, string> = {}): Response {
	return htmlResponse(`<!DOCTYPE html><html><body><p>${message}</p></body></html>`, 403, cookieHeaders, extraHeaders);
}

function csrfFailedResponse(cookieHeaders: string[] = []): Response {
	const headers = new Headers({
		'content-type': 'application/json; charset=utf-8',
	});

	appendSetCookieHeaders(headers, cookieHeaders);

	return new Response(JSON.stringify({ message: 'CSRF check failed' }), {
		status: 412,
		headers,
	});
}

function acceptsHtml(request: Request): boolean {
	const accept = request.headers.get('accept') ?? '';

	return accept.toLowerCase().includes('html');
}

function buildLoginRedirect(request: Request, cookieHeaders: string[] = []): Response {
	const requestUrl = new URL(request.url);
	const loginUrl = new URL('/login', requestUrl.origin);
	loginUrl.searchParams.set('redirect_url', `${requestUrl.pathname}${requestUrl.search}`);

	return redirectResponse(loginUrl.toString(), cookieHeaders);
}

function unauthenticatedResponse(request: Request, cookieHeaders: string[] = []): Response {
	if (acceptsHtml(request)) {
		return buildLoginRedirect(request, cookieHeaders);
	}

	const headers = new Headers({
		'content-type': 'application/json; charset=utf-8',
	});

	appendSetCookieHeaders(headers, cookieHeaders);

	return new Response(JSON.stringify({ message: 'Current user is not logged in' }), {
		status: 401,
		headers,
	});
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

	if (pathname.includes('/login/flow')) {
		return `${url.origin}${pathname.slice(0, pathname.indexOf('/login/flow'))}`;
	}

	return url.origin;
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

function getClientName(request: Request): string {
	const userAgent = request.headers.get('user-agent');

	return userAgent && userAgent !== '' ? userAgent : 'unknown';
}

function renderInvalidRequestPage(): string {
	return `<!DOCTYPE html>
<html>
<head><title>Error – Nextcloud</title></head>
<body>
<ul class="error">
<li><strong>Access Forbidden</strong></li>
<li>Invalid request</li>
</ul>
</body>
</html>`;
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

function buildGrantPageUrl(
	request: Request,
	stateToken: string,
	clientIdentifier = '',
	user = '',
	direct = 0,
	providedRedirectUri = '',
): string {
	const url = new URL(request.url);
	url.pathname = '/login/flow/grant';
	url.search = '';

	if (clientIdentifier) {
		url.searchParams.set('clientIdentifier', clientIdentifier);
	}

	if (user) {
		url.searchParams.set('user', user);
	}

	if (direct === 1) {
		url.searchParams.set('direct', '1');
	}

	if (providedRedirectUri) {
		url.searchParams.set('providedRedirectUri', providedRedirectUri);
	}

	url.searchParams.set('stateToken', stateToken);

	return url.toString();
}

export function handleLoginFlowV1ShowAuthPicker(
	request: Request,
	resolved: ResolvedSession,
	clientIdentifier = '',
	user = '',
	direct = 0,
	providedRedirectUri = '',
): Response {
	const cookieHeaders = [...resolved.sameSiteCookieHeaders];
	ensureSessionCookie(resolved, cookieHeaders);

	const ocsRequest = request.headers.get('OCS-APIREQUEST');

	if (ocsRequest !== 'true' && clientIdentifier === '') {
		return htmlResponse(renderInvalidRequestPage(), 200, cookieHeaders);
	}

	const clientName = getClientName(request);
	const stateToken = generateStateToken();
	resolved.session.loginFlowV1StateToken = stateToken;
	updateSession(resolved.session);

	const grantUrl = buildGrantPageUrl(request, stateToken, clientIdentifier, user, direct, providedRedirectUri);

	return htmlResponse(renderAuthPickerPage(clientName, grantUrl), 200, cookieHeaders);
}

export function handleLoginFlowV1GrantPage(
	request: Request,
	resolved: ResolvedSession,
	stateToken: string | null,
	clientIdentifier = '',
): Response {
	const cookieHeaders = [...resolved.sameSiteCookieHeaders];
	ensureSessionCookie(resolved, cookieHeaders);

	if (!isLoggedIn(resolved.session)) {
		return unauthenticatedResponse(request, cookieHeaders);
	}

	if (stateToken === null || !isValidStateToken(resolved.session.loginFlowV1StateToken, stateToken)) {
		return forbiddenHtml('State token does not match', cookieHeaders);
	}

	const userId = resolved.session.userId ?? '';
	const clientName = clientIdentifier !== '' ? clientIdentifier : getClientName(request);

	return htmlResponse(renderGrantPage(userId, clientName, stateToken), 200, cookieHeaders);
}

export function handleLoginFlowV1GenerateAppPassword(
	request: Request,
	resolved: ResolvedSession,
	body: string,
): Response {
	const cookieHeaders = [...resolved.sameSiteCookieHeaders];
	ensureSessionCookie(resolved, cookieHeaders);

	const requestToken = parseRequestToken(request, body);

	if (!isCsrfTokenValid(resolved.session.csrfToken, requestToken ?? '')) {
		return csrfFailedResponse(cookieHeaders);
	}

	const stateToken = parseStateToken(request, body);

	if (stateToken === null || !isValidStateToken(resolved.session.loginFlowV1StateToken, stateToken)) {
		resolved.session.loginFlowV1StateToken = undefined;
		updateSession(resolved.session);

		return forbiddenHtml('State token does not match', cookieHeaders);
	}

	resolved.session.loginFlowV1StateToken = undefined;
	updateSession(resolved.session);

	if (!isLoggedIn(resolved.session)) {
		return emptyForbiddenResponse(cookieHeaders);
	}

	if (!isPasswordConfirmationFresh(resolved.session.lastPasswordConfirm)) {
		return forbiddenHtml('Password confirmation is required', cookieHeaders, {
			'x-nc-auth-notconfirmed': 'true',
		});
	}

	const userId = resolved.session.userId ?? '';
	const loginName = resolved.session.loginName ?? userId;
	const userAgent = getClientName(request);
	const appPassword = generateAppPasswordToken();

	storeAppPasswordToken(userId, loginName, appPassword, userAgent);

	resolved.session.loginToken = undefined;
	updateSession(resolved.session);

	const redirectUri = `nc://login/server:${getServerPath(request)}&user:${encodeURIComponent(loginName)}&password:${encodeURIComponent(appPassword)}`;

	return redirectResponse(redirectUri, cookieHeaders);
}

export function handleLoginFlowV1ApptokenPost(
	request: Request,
	resolved: ResolvedSession,
	body: string,
): Response {
	const cookieHeaders = [...resolved.sameSiteCookieHeaders];
	ensureSessionCookie(resolved, cookieHeaders);

	const requestToken = parseRequestToken(request, body);

	if (!isCsrfTokenValid(resolved.session.csrfToken, requestToken ?? '')) {
		return csrfFailedResponse(cookieHeaders);
	}

	const stateToken = parseStateToken(request, body);

	if (stateToken === null || !isValidStateToken(resolved.session.loginFlowV1StateToken, stateToken)) {
		return forbiddenHtml('State token does not match', cookieHeaders);
	}

	const params = new URLSearchParams(body);
	const user = params.get('user') ?? '';
	const password = params.get('password') ?? '';

	const stored = lookupAppPasswordToken(password);

	if (!stored || stored.loginName !== user) {
		return forbiddenHtml('Invalid app password', cookieHeaders);
	}

	const redirectUri = `nc://login/server:${getServerPath(request)}&user:${encodeURIComponent(user)}&password:${encodeURIComponent(password)}`;

	return redirectResponse(redirectUri, cookieHeaders);
}
