import { SESSION_COOKIE, USERNAME_COOKIE } from '@/src/server/auth/cookies';
import { getOrCreateSession, updateSession } from '@/src/server/auth/session-store';
import {
	handleGetDeletedShares,
	handleUndeleteShare,
} from '@/src/server/files_sharing/deleted-share-api';
import {
	handleAcceptShare,
	handleCreateShare,
	handleDeleteShare,
	handleGenerateToken,
	handleGetInheritedShares,
	handleGetShare,
	handleGetShares,
	handlePendingShares,
	handleSendShareEmail,
	handleUpdateShare,
} from '@/src/server/files_sharing/share-api';
import {
	handleShareesFindRecommended,
	handleShareesSearch,
} from '@/src/server/files_sharing/sharees-api';
import { snapshotResponse } from '../compare';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';
import { parseCookiesFromOptions } from './auth';

const SHARES_PATH = '/ocs/v2.php/apps/files_sharing/api/v1/shares';
const INHERITED_PATH = '/ocs/v2.php/apps/files_sharing/api/v1/shares/inherited';
const PENDING_PATH = '/ocs/v2.php/apps/files_sharing/api/v1/shares/pending';
const TOKEN_PATH = '/ocs/v2.php/apps/files_sharing/api/v1/token';
const SHAREES_PATH = '/ocs/v2.php/apps/files_sharing/api/v1/sharees';
const SHAREES_RECOMMENDED_PATH = '/ocs/v2.php/apps/files_sharing/api/v1/sharees_recommended';
const SHARE_ID_PATH = /^\/ocs\/v2\.php\/apps\/files_sharing\/api\/v1\/shares\/(\d+)$/;
const PENDING_ID_PATH = /^\/ocs\/v2\.php\/apps\/files_sharing\/api\/v1\/shares\/pending\/(\d+)$/;
const SEND_EMAIL_PATH = /^\/ocs\/v2\.php\/apps\/files_sharing\/api\/v1\/shares\/(\d+)\/send-email$/;
const DELETED_SHARES_PATH = '/ocs/v2.php/apps/files_sharing/api/v1/deletedshares';
const DELETED_SHARE_ID_PATH = /^\/ocs\/v2\.php\/apps\/files_sharing\/api\/v1\/deletedshares\/([^/]+)$/;

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

export async function handleFilesSharingOcsMock(
	pathname: string,
	search: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	const method = (options.method ?? 'GET').toUpperCase();

	ensureSessionFromLoginCookies(options);

	if (method === 'GET' && pathname === SHARES_PATH) {
		return responseToSnapshot(handleGetShares(buildRequest(pathname, search, options)));
	}

	if (method === 'POST' && pathname === SHARES_PATH) {
		return responseToSnapshot(await handleCreateShare(buildRequest(pathname, search, options)));
	}

	if (method === 'GET' && pathname === INHERITED_PATH) {
		return responseToSnapshot(handleGetInheritedShares(buildRequest(pathname, search, options)));
	}

	if (method === 'GET' && pathname === PENDING_PATH) {
		return responseToSnapshot(handlePendingShares(buildRequest(pathname, search, options)));
	}

	if (method === 'GET' && pathname === TOKEN_PATH) {
		return responseToSnapshot(handleGenerateToken(buildRequest(pathname, search, options)));
	}

	if (method === 'GET' && pathname === SHAREES_PATH) {
		return responseToSnapshot(handleShareesSearch(buildRequest(pathname, search, options)));
	}

	if (method === 'GET' && pathname === SHAREES_RECOMMENDED_PATH) {
		return responseToSnapshot(handleShareesFindRecommended(buildRequest(pathname, search, options)));
	}

	if (method === 'GET' && pathname === DELETED_SHARES_PATH) {
		return responseToSnapshot(handleGetDeletedShares(buildRequest(pathname, search, options)));
	}

	const deletedShareMatch = DELETED_SHARE_ID_PATH.exec(pathname);

	if (method === 'POST' && deletedShareMatch) {
		return responseToSnapshot(handleUndeleteShare(buildRequest(pathname, search, options), deletedShareMatch[1]));
	}

	const pendingMatch = PENDING_ID_PATH.exec(pathname);

	if (method === 'POST' && pendingMatch) {
		return responseToSnapshot(handleAcceptShare(buildRequest(pathname, search, options), pendingMatch[1]));
	}

	const sendEmailMatch = SEND_EMAIL_PATH.exec(pathname);

	if (method === 'POST' && sendEmailMatch) {
		return responseToSnapshot(await handleSendShareEmail(buildRequest(pathname, search, options), sendEmailMatch[1]));
	}

	const shareMatch = SHARE_ID_PATH.exec(pathname);

	if (shareMatch) {
		const id = shareMatch[1];

		if (method === 'GET') {
			return responseToSnapshot(handleGetShare(buildRequest(pathname, search, options), id));
		}

		if (method === 'PUT') {
			return responseToSnapshot(await handleUpdateShare(buildRequest(pathname, search, options), id));
		}

		if (method === 'DELETE') {
			return responseToSnapshot(handleDeleteShare(buildRequest(pathname, search, options), id));
		}
	}

	return null;
}

export function isFilesSharingOcsMockPath(pathname: string, method = 'GET'): boolean {
	const normalizedMethod = method.toUpperCase();

	if (normalizedMethod === 'GET' && (
		pathname === SHARES_PATH
		|| pathname === INHERITED_PATH
		|| pathname === PENDING_PATH
		|| pathname === TOKEN_PATH
		|| pathname === SHAREES_PATH
		|| pathname === SHAREES_RECOMMENDED_PATH
		|| pathname === DELETED_SHARES_PATH
		|| SHARE_ID_PATH.test(pathname)
	)) {
		return true;
	}

	if (normalizedMethod === 'POST' && (
		pathname === SHARES_PATH
		|| PENDING_ID_PATH.test(pathname)
		|| SEND_EMAIL_PATH.test(pathname)
		|| DELETED_SHARE_ID_PATH.test(pathname)
	)) {
		return true;
	}

	if (normalizedMethod === 'PUT' && SHARE_ID_PATH.test(pathname)) {
		return true;
	}

	if (normalizedMethod === 'DELETE' && SHARE_ID_PATH.test(pathname)) {
		return true;
	}

	return false;
}
