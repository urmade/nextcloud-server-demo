import { SESSION_COOKIE, USERNAME_COOKIE } from '@/src/server/auth/cookies';
import { getOrCreateSession, updateSession } from '@/src/server/auth/session-store';
import {
	handleDeleteExampleEvent,
	handleDownloadExampleEvent,
	handleGetDefaultContact,
	handleSetCreateExampleEvent,
	handleSetDefaultContact,
	handleSetEnableDefaultContactRequest,
	handleUploadExampleEvent,
} from '@/src/server/dav/example-content';
import { snapshotResponse } from '../compare';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';
import { parseCookiesFromOptions } from './auth';

const CONFIG_PATH = '/apps/dav/api/defaultcontact/config';
const CONTACT_PATH = '/apps/dav/api/defaultcontact/contact';
const ENABLE_PATH = '/apps/dav/api/exampleEvent/enable';
const EVENT_PATH = '/apps/dav/api/exampleEvent/event';

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

function normalizePath(pathname: string): string {
	if (pathname.startsWith('/index.php/')) {
		return pathname.slice('/index.php'.length);
	}

	return pathname;
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

export function isDavExampleContentMockPath(pathname: string): boolean {
	const normalized = normalizePath(pathname);

	return normalized === CONFIG_PATH
		|| normalized === CONTACT_PATH
		|| normalized === ENABLE_PATH
		|| normalized === EVENT_PATH;
}

export async function handleDavExampleContentMock(
	pathname: string,
	search: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	const method = (options.method ?? 'GET').toUpperCase();
	const normalized = normalizePath(pathname);

	if (!isDavExampleContentMockPath(normalized)) {
		return null;
	}

	const request = buildRequest(normalized, search, options);

	ensureSessionFromLoginCookies(options);

	if (normalized === CONFIG_PATH && method === 'PUT') {
		return responseToSnapshot(await handleSetEnableDefaultContactRequest(request));
	}

	if (normalized === CONTACT_PATH && method === 'GET') {
		return responseToSnapshot(handleGetDefaultContact(request));
	}

	if (normalized === CONTACT_PATH && method === 'PUT') {
		return responseToSnapshot(await handleSetDefaultContact(request));
	}

	if (normalized === ENABLE_PATH && method === 'POST') {
		return responseToSnapshot(await handleSetCreateExampleEvent(request));
	}

	if (normalized === EVENT_PATH && method === 'GET') {
		return responseToSnapshot(handleDownloadExampleEvent(request));
	}

	if (normalized === EVENT_PATH && method === 'POST') {
		return responseToSnapshot(await handleUploadExampleEvent(request));
	}

	if (normalized === EVENT_PATH && method === 'DELETE') {
		return responseToSnapshot(handleDeleteExampleEvent(request));
	}

	return null;
}
