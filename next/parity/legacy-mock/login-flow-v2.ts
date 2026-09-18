import {
	handleLoginFlowV2GrantPage,
	handleLoginFlowV2GrantPost,
	handleLoginFlowV2Init,
	handleLoginFlowV2Landing,
	handleLoginFlowV2Poll,
	handleLoginFlowV2ShowAuthPicker,
} from '@/src/server/auth/login-flow-v2';
import { resolveSession } from '@/src/server/auth/session';
import { resetLoginFlowV2Store } from '@/src/server/auth/login-flow-v2-store';
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
	if (pathname.startsWith('/index.php/login/v2')) {
		return pathname.replace('/index.php', '');
	}

	return pathname;
}

export async function handleLoginFlowV2Mock(
	pathname: string,
	search: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	const method = (options.method ?? 'GET').toUpperCase();
	const normalizedPath = normalizeLoginFlowPath(pathname);

	ensureSessionFromLoginCookies(options);

	if (normalizedPath === '/login/v2' && method === 'POST') {
		const request = buildRequest(normalizedPath, search, options);

		return responseToSnapshot(handleLoginFlowV2Init(request, resolveSession(request)));
	}

	if (normalizedPath === '/login/v2/poll' && method === 'POST') {
		const request = buildRequest(normalizedPath, search, options);

		return responseToSnapshot(await handleLoginFlowV2Poll(request, resolveSession(request)));
	}

	const landingMatch = /^\/login\/v2\/flow\/([^/]+)$/.exec(normalizedPath);

	if (landingMatch && method === 'GET') {
		const request = buildRequest(normalizedPath, search, options);
		const url = new URL(request.url);
		const user = url.searchParams.get('user') ?? '';
		const direct = Number.parseInt(url.searchParams.get('direct') ?? '0', 10);

		return responseToSnapshot(handleLoginFlowV2Landing(
			request,
			resolveSession(request),
			decodeURIComponent(landingMatch[1]),
			user,
			direct,
		));
	}

	if (normalizedPath === '/login/v2/flow' && method === 'GET') {
		const request = buildRequest(normalizedPath, search, options);
		const url = new URL(request.url);
		const user = url.searchParams.get('user') ?? '';
		const direct = Number.parseInt(url.searchParams.get('direct') ?? '0', 10);

		return responseToSnapshot(handleLoginFlowV2ShowAuthPicker(request, resolveSession(request), user, direct));
	}

	if (normalizedPath === '/login/v2/grant' && method === 'GET') {
		const request = buildRequest(normalizedPath, search, options);
		const url = new URL(request.url);
		const stateToken = url.searchParams.get('stateToken');

		return responseToSnapshot(handleLoginFlowV2GrantPage(request, resolveSession(request), stateToken));
	}

	if (normalizedPath === '/login/v2/grant' && method === 'POST') {
		const request = buildRequest(normalizedPath, search, options);

		const body = typeof options.body === 'string' ? options.body : '';

		return responseToSnapshot(handleLoginFlowV2GrantPost(request, resolveSession(request), body));
	}

	return null;
}

export function resetLegacyMockLoginFlowV2(): void {
	resetLoginFlowV2Store();
}
