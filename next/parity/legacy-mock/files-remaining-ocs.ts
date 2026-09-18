import { SESSION_COOKIE, USERNAME_COOKIE } from '@/src/server/auth/cookies';
import { getOrCreateSession, updateSession } from '@/src/server/auth/session-store';
import { handleConversionConvert } from '@/src/server/files/conversion';
import { handleGetFolderTree } from '@/src/server/files/folder-tree';
import {
	handleOpenLocalEditorCreate,
	handleOpenLocalEditorValidate,
} from '@/src/server/files/open-local-editor';
import {
	handleTransferOwnershipAccept,
	handleTransferOwnershipReject,
	handleTransferOwnershipTransfer,
} from '@/src/server/files/transfer-ownership';
import { snapshotResponse } from '../compare';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';
import { parseCookiesFromOptions } from './auth';

const OPEN_LOCAL_CREATE_PATH = '/ocs/v2.php/apps/files/api/v1/openlocaleditor';
const CONVERT_PATH = '/ocs/v2.php/apps/files/api/v1/convert';
const FOLDER_TREE_PATH = '/ocs/v2.php/apps/files/api/v1/folder-tree';
const TRANSFER_PATH = '/ocs/v2.php/apps/files/api/v1/transferownership';
const OPEN_LOCAL_VALIDATE_PATH = /^\/ocs\/v2\.php\/apps\/files\/api\/v1\/openlocaleditor\/([^/]+)$/;
const TRANSFER_ID_PATH = /^\/ocs\/v2\.php\/apps\/files\/api\/v1\/transferownership\/(\d+)$/;

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

export async function handleFilesRemainingOcsMock(
	pathname: string,
	search: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	const method = (options.method ?? 'GET').toUpperCase();

	ensureSessionFromLoginCookies(options);

	if (method === 'POST' && pathname === OPEN_LOCAL_CREATE_PATH) {
		return responseToSnapshot(await handleOpenLocalEditorCreate(buildRequest(pathname, search, options)));
	}

	const validateMatch = OPEN_LOCAL_VALIDATE_PATH.exec(pathname);

	if (method === 'POST' && validateMatch) {
		return responseToSnapshot(await handleOpenLocalEditorValidate(
			buildRequest(pathname, search, options),
			validateMatch[1],
		));
	}

	if (method === 'POST' && pathname === CONVERT_PATH) {
		return responseToSnapshot(await handleConversionConvert(buildRequest(pathname, search, options)));
	}

	if (method === 'GET' && pathname === FOLDER_TREE_PATH) {
		return responseToSnapshot(handleGetFolderTree(buildRequest(pathname, search, options)));
	}

	if (method === 'POST' && pathname === TRANSFER_PATH) {
		return responseToSnapshot(await handleTransferOwnershipTransfer(buildRequest(pathname, search, options)));
	}

	const transferMatch = TRANSFER_ID_PATH.exec(pathname);

	if (transferMatch) {
		const id = Number.parseInt(transferMatch[1], 10);

		if (method === 'POST') {
			return responseToSnapshot(await handleTransferOwnershipAccept(buildRequest(pathname, search, options), id));
		}

		if (method === 'DELETE') {
			return responseToSnapshot(await handleTransferOwnershipReject(buildRequest(pathname, search, options), id));
		}
	}

	return null;
}

export function isFilesRemainingOcsMockPath(pathname: string, method = 'GET'): boolean {
	const normalizedMethod = method.toUpperCase();

	if (normalizedMethod === 'POST' && pathname === OPEN_LOCAL_CREATE_PATH) {
		return true;
	}

	if (normalizedMethod === 'POST' && OPEN_LOCAL_VALIDATE_PATH.test(pathname)) {
		return true;
	}

	if (normalizedMethod === 'POST' && pathname === CONVERT_PATH) {
		return true;
	}

	if (normalizedMethod === 'GET' && pathname === FOLDER_TREE_PATH) {
		return true;
	}

	if (normalizedMethod === 'POST' && pathname === TRANSFER_PATH) {
		return true;
	}

	if ((normalizedMethod === 'POST' || normalizedMethod === 'DELETE') && TRANSFER_ID_PATH.test(pathname)) {
		return true;
	}

	return false;
}
