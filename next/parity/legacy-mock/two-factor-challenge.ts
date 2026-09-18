import { SESSION_COOKIE, USERNAME_COOKIE } from '@/src/server/auth/cookies';
import {
	getTwoFactorLoginRedirectUrl,
	handleConfirmProviderSetupPost,
	handleSelectChallengeGet,
	handleSetupProviderGet,
	handleSetupProvidersGet,
	handleShowChallengeGet,
	handleSolveChallengePost,
	isTwoFactorAuthenticated,
	needsSecondFactor,
	prepareTwoFactorLogin,
} from '@/src/server/auth/two-factor-challenge';
import { resolveSession } from '@/src/server/auth/session';
import { getOrCreateSession, updateSession } from '@/src/server/auth/session-store';
import { tryEnableTwoFactorProvider } from '@/src/server/two-factor/store';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';
import { snapshotResponse } from '../compare';
import { parseCookiesFromOptions } from './auth';

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

	if (isTwoFactorAuthenticated(userId) && session.twoFactorPendingUid !== userId && session.twoFactorDone !== userId) {
		prepareTwoFactorLogin(session);
	}

	updateSession(session);
}

const CHALLENGE_PATH = /^\/login\/challenge\/([^/]+)$/;
const SETUP_PROVIDER_PATH = /^\/login\/setupchallenge\/([^/]+)$/;

export async function handleTwoFactorChallengeMock(
	pathname: string,
	search: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	const method = (options.method ?? 'GET').toUpperCase();

	ensureSessionFromLoginCookies(options);

	if (method === 'GET' && pathname === '/login/selectchallenge') {
		const request = buildRequest(pathname, search, options);

		return responseToSnapshot(handleSelectChallengeGet(request, resolveSession(request)));
	}

	if (method === 'GET' && pathname === '/login/setupchallenge') {
		const request = buildRequest(pathname, search, options);

		return responseToSnapshot(handleSetupProvidersGet(request, resolveSession(request)));
	}

	const setupMatch = SETUP_PROVIDER_PATH.exec(pathname);

	if (setupMatch) {
		const providerId = decodeURIComponent(setupMatch[1]);
		const request = buildRequest(pathname, search, options);
		const resolved = resolveSession(request);

		if (method === 'GET') {
			return responseToSnapshot(handleSetupProviderGet(request, resolved, providerId));
		}

		if (method === 'POST') {
			return responseToSnapshot(handleConfirmProviderSetupPost(request, resolved, providerId));
		}
	}

	const challengeMatch = CHALLENGE_PATH.exec(pathname);

	if (!challengeMatch) {
		return null;
	}

	const challengeProviderId = decodeURIComponent(challengeMatch[1]);
	const request = buildRequest(pathname, search, options);
	const resolved = resolveSession(request);

	if (method === 'GET') {
		return responseToSnapshot(handleShowChallengeGet(request, resolved, challengeProviderId));
	}

	if (method === 'POST') {
		return responseToSnapshot(
			handleSolveChallengePost(
				request,
				resolved,
				challengeProviderId,
				typeof options.body === 'string' ? options.body : '',
			),
		);
	}

	return null;
}

export function seedTwoFactorPendingSession(sessionId: string, userId = 'admin'): void {
	const session = getOrCreateSession(sessionId);
	session.userId = userId;
	session.loginName = userId;
	session.loginToken = session.loginToken ?? 'parity-login-token';
	session.lastPasswordConfirm = Math.floor(Date.now() / 1000);
	tryEnableTwoFactorProvider('parity-totp', userId);
	prepareTwoFactorLogin(session);
	updateSession(session);
}

export function isTwoFactorChallengePath(pathname: string): boolean {
	return pathname === '/login/selectchallenge'
		|| pathname === '/login/setupchallenge'
		|| SETUP_PROVIDER_PATH.test(pathname)
		|| CHALLENGE_PATH.test(pathname);
}
