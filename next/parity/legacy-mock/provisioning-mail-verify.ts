import { SESSION_COOKIE, USERNAME_COOKIE } from '@/src/server/auth/cookies';
import { getOrCreateSession, updateSession } from '@/src/server/auth/session-store';
import { handleShowVerifyMail, handleVerifyMailPost } from '@/src/server/provisioning/mail-verify';
import { snapshotResponse } from '../compare';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';
import { parseCookiesFromOptions } from './auth';

const MAIL_VERIFY_PATH = /^\/(?:index\.php\/)?apps\/provisioning_api\/mailVerification\/([^/]+)\/([^/]+)\/([^/]+)\/?$/;

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
	updateSession(session);
}

export function isProvisioningMailVerifyMockPath(pathname: string, method = 'GET'): boolean {
	const normalizedMethod = method.toUpperCase();

	if (normalizedMethod !== 'GET' && normalizedMethod !== 'POST') {
		return false;
	}

	return MAIL_VERIFY_PATH.test(pathname);
}

export async function handleProvisioningMailVerifyMock(
	pathname: string,
	search: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	const match = MAIL_VERIFY_PATH.exec(pathname);

	if (!match) {
		return null;
	}

	ensureSessionFromLoginCookies(options);
	const request = buildRequest(pathname, search, options);
	const key = decodeURIComponent(match[1]);
	const token = decodeURIComponent(match[2]);
	const userId = decodeURIComponent(match[3]);
	const method = (options.method ?? 'GET').toUpperCase();

	if (method === 'GET') {
		return responseToSnapshot(handleShowVerifyMail(request, key, token, userId));
	}

	if (method === 'POST') {
		return responseToSnapshot(await handleVerifyMailPost(request, key, token, userId));
	}

	return null;
}
