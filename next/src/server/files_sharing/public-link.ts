import { isCsrfTokenValid } from '@/src/server/auth/csrf';
import { parseCookieHeader, SESSION_COOKIE } from '@/src/server/auth/cookies';
import {
	appendSetCookieHeaders,
	createSessionCookieForNew,
	resolveSession,
	type ResolvedSession,
} from '@/src/server/auth/session';
import { getSession, updateSession } from '@/src/server/auth/session-store';
import { getPreviewFixture } from '@/src/server/fixtures/binary';
import { binaryResponse, cacheForSeconds, jsonArrayResponse } from '@/src/server/http/binary';
import { PERMISSION_READ } from './constants';
import { resolveUserNode } from './nodes';
import {
	buildAuthenticateRedirectLocation,
	buildPostAuthRedirectLocation,
	isPublicShareAuthenticated,
	storeAuthenticateRedirect,
	storeDavAuthenticatedShare,
	storePublicShareAuth,
} from './public-session';
import { getShareByToken } from './store';
import type { ShareRecord } from './types';

const HTML_CONTENT_TYPE = 'text/html; charset=UTF-8';
const JSON_HEADERS = {
	'content-type': 'application/json; charset=utf-8',
};

function getOrigin(request: Request): string {
	const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '127.0.0.1:3100';
	const proto = request.headers.get('x-forwarded-proto') ?? 'http';

	return `${proto}://${host}`;
}

function redirect303(location: string, cookieHeaders: string[] = []): Response {
	const headers = new Headers({ location });

	appendSetCookieHeaders(headers, cookieHeaders);

	return new Response(null, {
		status: 303,
		headers,
	});
}

function shareNotFoundHtml(message = 'This share does not exist or is no longer available'): Response {
	const body = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Share not found</title></head>
<body class="guest">
<div class="body-login-container update">
<h2>Share not found</h2>
<p class="infogroup">${message}</p>
</div>
</body>
</html>`;

	return new Response(body, {
		status: 404,
		headers: {
			'content-type': HTML_CONTENT_TYPE,
		},
	});
}

function authPageHtml(wrongpw = false): Response {
	const body = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Password required</title></head>
<body class="guest">
<div id="core-public-share-auth" class="guest-box"${wrongpw ? ' data-wrongpw="true"' : ''}></div>
</body>
</html>`;

	return new Response(body, {
		status: 200,
		headers: {
			'content-type': HTML_CONTENT_TYPE,
		},
	});
}

function publicSharePageHtml(token: string): Response {
	const body = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Public share</title></head>
<body id="body-public-share" data-share-token="${token}"></body>
</html>`;

	return new Response(body, {
		status: 200,
		headers: {
			'content-type': HTML_CONTENT_TYPE,
		},
	});
}

function csrfFailure(): Response {
	return new Response(JSON.stringify({ message: 'CSRF check failed' }), {
		status: 412,
		headers: JSON_HEADERS,
	});
}

function isLinkSharingEnabled(): boolean {
	return true;
}

function validateShareNode(share: ShareRecord): boolean {
	const located = resolveUserNode(share.shareOwner, share.nodeId);

	return located !== null;
}

function shareCanSeeContent(share: ShareRecord): boolean {
	return !share.hideDownload;
}

function resolvePublicSession(request: Request): ResolvedSession {
	return resolveSession(request);
}

function getRequestToken(request: Request, body: URLSearchParams): string | null {
	return request.headers.get('requesttoken')
		?? body.get('requesttoken')
		?? null;
}

function enforceCsrf(request: Request, resolved: ResolvedSession, body: URLSearchParams): Response | null {
	const token = getRequestToken(request, body);

	if (!isCsrfTokenValid(resolved.session.csrfToken, token ?? '')) {
		return csrfFailure();
	}

	return null;
}

interface MiddlewareOptions {
	methodName: 'showShare' | 'showAuthenticate' | 'authenticate' | 'downloadShare' | 'directLink';
	requireAuthPageBypass?: boolean;
	isAuthController?: boolean;
}

function runPublicShareMiddleware(
	request: Request,
	token: string,
	resolved: ResolvedSession,
	options: MiddlewareOptions,
): ShareRecord | Response {
	if (!isLinkSharingEnabled()) {
		return shareNotFoundHtml('Link sharing is disabled');
	}

	if (!token) {
		return shareNotFoundHtml();
	}

	const share = getShareByToken(token);

	if (!share || !validateShareNode(share)) {
		return shareNotFoundHtml();
	}

	if (options.methodName === 'authenticate' || options.methodName === 'showAuthenticate') {
		return share;
	}

	const passwordHash = share.password;
	const authenticated = isPublicShareAuthenticated(resolved.session, token, passwordHash);

	if (authenticated) {
		return share;
	}

	if (options.isAuthController) {
		const url = new URL(request.url);
		const params: Record<string, string> = { token };

		for (const [key, value] of url.searchParams.entries()) {
			params[key] = value;
		}

		storeAuthenticateRedirect(resolved.session, params);
		updateSession(resolved.session);

		const redirectTarget = options.methodName === 'downloadShare' ? 'downloadShare' : 'showShare';

		return redirect303(
			buildAuthenticateRedirectLocation(token, redirectTarget),
			resolved.isNew ? [createSessionCookieForNew(resolved.session)] : resolved.sameSiteCookieHeaders,
		);
	}

	return shareNotFoundHtml();
}

export function handleShowShare(request: Request, token: string, subPath = ''): Response {
	const resolved = resolvePublicSession(request);
	const middleware = runPublicShareMiddleware(request, token, resolved, {
		methodName: 'showShare',
		isAuthController: true,
	});

	if (middleware instanceof Response) {
		return middleware;
	}

	const share = middleware;
	const located = resolveUserNode(share.shareOwner, share.nodeId);

	if (!located) {
		return shareNotFoundHtml();
	}

	if (located.node.kind === 'file' && subPath !== '') {
		return shareNotFoundHtml();
	}

	return publicSharePageHtml(token);
}

export function handleShowAuthenticate(request: Request, token: string): Response {
	const resolved = resolvePublicSession(request);
	const middleware = runPublicShareMiddleware(request, token, resolved, {
		methodName: 'showAuthenticate',
	});

	if (middleware instanceof Response) {
		return middleware;
	}

	return authPageHtml(false);
}

export async function handleAuthenticate(
	request: Request,
	token: string,
	redirect: string,
): Promise<Response> {
	const resolved = resolvePublicSession(request);
	const middleware = runPublicShareMiddleware(request, token, resolved, {
		methodName: 'authenticate',
	});

	if (middleware instanceof Response) {
		return middleware;
	}

	const share = middleware;
	const bodyText = await request.text();
	const body = new URLSearchParams(bodyText);
	const csrf = enforceCsrf(request, resolved, body);

	if (csrf) {
		return csrf;
	}

	const password = body.get('password') ?? '';
	const passwordRequest = body.get('passwordRequest') ?? 'no';

	if (passwordRequest === '') {
		return authPageHtml(false);
	}

	if (share.password && share.password !== password) {
		return authPageHtml(true);
	}

	const storedRaw = resolved.session.publicLinkAuthenticateRedirect;
	let storedParams: Record<string, string> | null = null;

	if (storedRaw) {
		try {
			storedParams = JSON.parse(storedRaw) as Record<string, string>;
		} catch {
			storedParams = null;
		}
	}

	if (share.password) {
		storePublicShareAuth(resolved.session, token, share.password);
	}

	storeDavAuthenticatedShare(resolved.session, share.id);
	updateSession(resolved.session);

	const location = redirect === 'downloadShare'
		? `/s/${encodeURIComponent(token)}/download/`
		: buildPostAuthRedirectLocation(token, storedParams);

	return redirect303(location, resolved.sameSiteCookieHeaders);
}

export function handleDownloadShare(request: Request, token: string, filename = ''): Response {
	const resolved = resolvePublicSession(request);
	const middleware = runPublicShareMiddleware(request, token, resolved, {
		methodName: 'downloadShare',
		isAuthController: true,
	});

	if (middleware instanceof Response) {
		return middleware;
	}

	const share = middleware;

	if ((share.permissions & PERMISSION_READ) === 0) {
		return new Response('Share has no read permission', {
			status: 403,
			headers: {
				'content-type': 'text/plain; charset=utf-8',
			},
		});
	}

	if (!shareCanSeeContent(share)) {
		return shareNotFoundHtml();
	}

	const located = resolveUserNode(share.shareOwner, share.nodeId);

	if (!located) {
		return shareNotFoundHtml();
	}

	let node = located.node;
	let davPath = '';

	if (filename) {
		if (node.kind !== 'directory') {
			return shareNotFoundHtml();
		}

		const child = node.children?.find((entry) => entry.name === filename);

		if (!child) {
			return shareNotFoundHtml();
		}

		node = child;
		davPath = `/${filename}`;
	}

	const params = new URLSearchParams();

	if (node.kind === 'directory') {
		params.set('accept', 'zip');
	}

	const query = params.toString();
	const origin = getOrigin(request);
	const location = `${origin}/public.php/dav/files/${token}${davPath}${query ? `?${query}` : ''}`;

	return redirect303(location);
}

export function handleDirectLink(request: Request, token: string): Response {
	if (token === '') {
		return jsonArrayResponse(400);
	}

	const resolved = resolvePublicSession(request);
	const middleware = runPublicShareMiddleware(request, token, resolved, {
		methodName: 'directLink',
		isAuthController: false,
	});

	if (middleware instanceof Response) {
		return middleware;
	}

	const share = middleware;

	if ((share.permissions & PERMISSION_READ) === 0) {
		return jsonArrayResponse(403);
	}

	if (share.password) {
		return jsonArrayResponse(403);
	}

	if (!shareCanSeeContent(share)) {
		return jsonArrayResponse(403);
	}

	const located = resolveUserNode(share.shareOwner, share.nodeId);

	if (!located) {
		return jsonArrayResponse(404);
	}

	if (located.node.kind === 'directory') {
		return jsonArrayResponse(400);
	}

	const bytes = getPreviewFixture();
	const response = binaryResponse(bytes, 200, 'image/png');

	return cacheForSeconds(response, 60 * 60 * 24);
}

export function ensurePublicLinkSessionFromCookies(cookieHeader: string | null): void {
	const cookies = parseCookieHeader(cookieHeader);
	const sessionId = cookies[SESSION_COOKIE];

	if (!sessionId) {
		return;
	}

	getSession(sessionId);
}
