import {
	handleAddResource,
	handleCreateCollectionOnResource,
	handleGetCollectionsByResource,
	handleListCollection,
	handleRemoveResource,
	handleRenameCollection,
	handleSearchCollections,
} from '@/src/server/collaboration-resources/api';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';
import { snapshotResponse } from '../compare';
import { parseCookiesFromOptions } from './auth';
import { SESSION_COOKIE, USERNAME_COOKIE } from '@/src/server/auth/cookies';
import { getOrCreateSession, updateSession } from '@/src/server/auth/session-store';

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

export async function handleCollaborationResourcesMock(
	pathname: string,
	search: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	const method = (options.method ?? 'GET').toUpperCase();

	if (!pathname.startsWith('/ocs/v2.php/collaboration/resources/')) {
		return null;
	}

	ensureSessionFromLoginCookies(options);

	const searchMatch = /^\/ocs\/v2\.php\/collaboration\/resources\/collections\/search\/([^/]+)$/.exec(pathname);

	if (method === 'GET' && searchMatch) {
		return responseToSnapshot(handleSearchCollections(
			buildRequest(pathname, search, options),
			decodeURIComponent(searchMatch[1]),
		));
	}

	const collectionMatch = /^\/ocs\/v2\.php\/collaboration\/resources\/collections\/(\d+)$/.exec(pathname);

	if (collectionMatch) {
		const collectionId = Number.parseInt(collectionMatch[1], 10);
		const request = buildRequest(pathname, search, options);

		if (method === 'GET') {
			return responseToSnapshot(handleListCollection(request, collectionId));
		}

		if (method === 'POST') {
			return responseToSnapshot(await handleAddResource(request, collectionId));
		}

		if (method === 'PUT') {
			return responseToSnapshot(await handleRenameCollection(request, collectionId));
		}

		if (method === 'DELETE') {
			const url = new URL(`http://127.0.0.1:3100${pathname}${search ? `?${search}` : ''}`);
			const resourceType = url.searchParams.get('resourceType') ?? '';
			const resourceId = url.searchParams.get('resourceId') ?? '';

			return responseToSnapshot(handleRemoveResource(request, collectionId, resourceType, resourceId));
		}
	}

	const resourceMatch = /^\/ocs\/v2\.php\/collaboration\/resources\/([^/]+)\/([^/]+)$/.exec(pathname);

	if (resourceMatch) {
		const request = buildRequest(pathname, search, options);
		const resourceType = decodeURIComponent(resourceMatch[1]);
		const resourceId = decodeURIComponent(resourceMatch[2]);

		if (method === 'GET') {
			return responseToSnapshot(handleGetCollectionsByResource(request, resourceType, resourceId));
		}

		if (method === 'POST') {
			return responseToSnapshot(await handleCreateCollectionOnResource(request, resourceType, resourceId));
		}
	}

	return null;
}
