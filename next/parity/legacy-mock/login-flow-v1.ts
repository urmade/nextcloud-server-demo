import {
	handleLoginFlowV1ApptokenPost,
	handleLoginFlowV1GenerateAppPassword,
	handleLoginFlowV1GrantPage,
	handleLoginFlowV1ShowAuthPicker,
} from '@/src/server/auth/login-flow-v1';
import { resolveSession } from '@/src/server/auth/session';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';
import { snapshotResponse } from '../compare';
import { parseCookiesFromOptions } from './auth';
import { SESSION_COOKIE, USERNAME_COOKIE } from '@/src/server/auth/cookies';
import { getOrCreateSession, updateSession } from '@/src/server/auth/session-store';

function ensureSessionFromLoginCookies(options: ParityRequestOptions): void {
	const cookies = parseCookiesFromOptions(options);
	const sessionId = cookies[SESSION_COOKIE];
	const userId = cookies[USERNAME_COOKIE];

	if (!sessionId || !userId) {
		return;
	}

	const session = getOrCreateSession(sessionId);
	session.userId = userId;
	session.loginName = userId;
	session.loginToken = session.loginToken ?? `parity-login-token-${sessionId}`;

	if (session.lastPasswordConfirm === undefined) {
		session.lastPasswordConfirm = Math.floor(Date.now() / 1000);
	}

	updateSession(session);
}

function buildRequest(pathname: string, search: string, options: ParityRequestOptions): Request {
	const origin = 'http://127.0.0.1:3100';

	return new Request(`${origin}${pathname}${search ? `?${search}` : ''}`, {
		method: options.method ?? 'GET',
		headers: options.headers ?? {},
		body: options.body,
	});
}

async function responseToSnapshot(response: Response): Promise<ParityResponseSnapshot> {
	const rawBody = await response.text();

	return snapshotResponse(response, rawBody);
}

function normalizeLoginFlowPath(pathname: string): string {
	if (pathname.startsWith('/index.php/login/flow')) {
		return pathname.replace('/index.php', '');
	}

	return pathname;
}

export async function handleLoginFlowV1Mock(
	pathname: string,
	search: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	const method = (options.method ?? 'GET').toUpperCase();
	const normalizedPath = normalizeLoginFlowPath(pathname);

	ensureSessionFromLoginCookies(options);

	if (normalizedPath === '/login/flow' && method === 'GET') {
		const request = buildRequest(normalizedPath, search, options);
		const url = new URL(request.url);
		const clientIdentifier = url.searchParams.get('clientIdentifier') ?? '';
		const user = url.searchParams.get('user') ?? '';
		const direct = Number.parseInt(url.searchParams.get('direct') ?? '0', 10);
		const providedRedirectUri = url.searchParams.get('providedRedirectUri') ?? '';

		return responseToSnapshot(handleLoginFlowV1ShowAuthPicker(
			request,
			resolveSession(request),
			clientIdentifier,
			user,
			direct,
			providedRedirectUri,
		));
	}

	if (normalizedPath === '/login/flow/grant' && method === 'GET') {
		const request = buildRequest(normalizedPath, search, options);
		const url = new URL(request.url);
		const stateToken = url.searchParams.get('stateToken');
		const clientIdentifier = url.searchParams.get('clientIdentifier') ?? '';

		return responseToSnapshot(handleLoginFlowV1GrantPage(
			request,
			resolveSession(request),
			stateToken,
			clientIdentifier,
		));
	}

	if (normalizedPath === '/login/flow' && method === 'POST') {
		const request = buildRequest(normalizedPath, search, options);
		const body = typeof options.body === 'string' ? options.body : '';

		return responseToSnapshot(handleLoginFlowV1GenerateAppPassword(request, resolveSession(request), body));
	}

	if (normalizedPath === '/login/flow/apptoken' && method === 'POST') {
		const request = buildRequest(normalizedPath, search, options);
		const body = typeof options.body === 'string' ? options.body : '';

		return responseToSnapshot(handleLoginFlowV1ApptokenPost(request, resolveSession(request), body));
	}

	return null;
}
