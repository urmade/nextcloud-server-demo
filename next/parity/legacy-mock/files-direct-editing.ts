import { SESSION_COOKIE, USERNAME_COOKIE } from '@/src/server/auth/cookies';
import { getOrCreateSession, updateSession } from '@/src/server/auth/session-store';
import {
	handleDirectEditingCreate,
	handleDirectEditingInfo,
	handleDirectEditingOpen,
	handleDirectEditingTemplates,
} from '@/src/server/files/direct-editing';
import { snapshotResponse } from '../compare';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';
import { parseCookiesFromOptions } from './auth';

const INFO_PATH = '/ocs/v2.php/apps/files/api/v1/directEditing';
const CREATE_PATH = '/ocs/v2.php/apps/files/api/v1/directEditing/create';
const OPEN_PATH = '/ocs/v2.php/apps/files/api/v1/directEditing/open';
const TEMPLATES_PATH = /^\/ocs\/v2\.php\/apps\/files\/api\/v1\/directEditing\/templates\/([^/]+)\/([^/]+)$/;

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

export async function handleFilesDirectEditingMock(
	pathname: string,
	search: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	const method = (options.method ?? 'GET').toUpperCase();

	ensureSessionFromLoginCookies(options);

	if (method === 'GET' && pathname === INFO_PATH) {
		return responseToSnapshot(handleDirectEditingInfo(buildRequest(pathname, search, options)));
	}

	const templatesMatch = TEMPLATES_PATH.exec(pathname);

	if (method === 'GET' && templatesMatch) {
		return responseToSnapshot(handleDirectEditingTemplates(
			buildRequest(pathname, search, options),
			decodeURIComponent(templatesMatch[1]),
			decodeURIComponent(templatesMatch[2]),
		));
	}

	if (method === 'POST' && pathname === OPEN_PATH) {
		return responseToSnapshot(await handleDirectEditingOpen(buildRequest(pathname, search, options)));
	}

	if (method === 'POST' && pathname === CREATE_PATH) {
		return responseToSnapshot(await handleDirectEditingCreate(buildRequest(pathname, search, options)));
	}

	return null;
}

export function isFilesDirectEditingMockPath(pathname: string, method = 'GET'): boolean {
	const normalizedMethod = method.toUpperCase();

	if (normalizedMethod === 'GET' && pathname === INFO_PATH) {
		return true;
	}

	if (normalizedMethod === 'GET' && TEMPLATES_PATH.test(pathname)) {
		return true;
	}

	if (normalizedMethod === 'POST' && (pathname === OPEN_PATH || pathname === CREATE_PATH)) {
		return true;
	}

	return false;
}
