import { SESSION_COOKIE, USERNAME_COOKIE } from '@/src/server/auth/cookies';
import { getOrCreateSession, updateSession } from '@/src/server/auth/session-store';
import {
	handleTemplateCreate,
	handleTemplateList,
	handleTemplateListFields,
	handleTemplatePath,
} from '@/src/server/files/templates';
import { snapshotResponse } from '../compare';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';
import { parseCookiesFromOptions } from './auth';

const LIST_PATH = '/ocs/v2.php/apps/files/api/v1/templates';
const CREATE_PATH = '/ocs/v2.php/apps/files/api/v1/templates/create';
const PATH_PATH = '/ocs/v2.php/apps/files/api/v1/templates/path';
const FIELDS_PATH = /^\/ocs\/v2\.php\/apps\/files\/api\/v1\/templates\/fields\/(\d+)$/;

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

export async function handleFilesTemplatesMock(
	pathname: string,
	search: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	const method = (options.method ?? 'GET').toUpperCase();

	ensureSessionFromLoginCookies(options);

	if (method === 'GET' && pathname === LIST_PATH) {
		return responseToSnapshot(handleTemplateList(buildRequest(pathname, search, options)));
	}

	const fieldsMatch = FIELDS_PATH.exec(pathname);

	if (method === 'GET' && fieldsMatch) {
		return responseToSnapshot(handleTemplateListFields(
			buildRequest(pathname, search, options),
			Number.parseInt(fieldsMatch[1], 10),
		));
	}

	if (method === 'POST' && pathname === CREATE_PATH) {
		return responseToSnapshot(await handleTemplateCreate(buildRequest(pathname, search, options)));
	}

	if (method === 'POST' && pathname === PATH_PATH) {
		return responseToSnapshot(await handleTemplatePath(buildRequest(pathname, search, options)));
	}

	return null;
}

export function isFilesTemplatesMockPath(pathname: string, method = 'GET'): boolean {
	const normalizedMethod = method.toUpperCase();

	if (normalizedMethod === 'GET' && pathname === LIST_PATH) {
		return true;
	}

	if (normalizedMethod === 'GET' && FIELDS_PATH.test(pathname)) {
		return true;
	}

	if (normalizedMethod === 'POST' && (pathname === CREATE_PATH || pathname === PATH_PATH)) {
		return true;
	}

	return false;
}
