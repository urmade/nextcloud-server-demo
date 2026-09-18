import {
	handleExtractPublicReferences,
	handleExtractReferences,
	handleGetProvidersInfo,
	handleResolveMany,
	handleResolveOne,
	handleResolveOnePublic,
	handleResolvePublicMany,
	handleTouchProvider,
} from '@/src/server/reference/api';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';
import { snapshotResponse } from '../compare';

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

export async function handleReferenceMock(
	pathname: string,
	search: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	const method = (options.method ?? 'GET').toUpperCase();

	if (method === 'POST' && pathname === '/ocs/v2.php/references/extract') {
		return responseToSnapshot(await handleExtractReferences(buildRequest(pathname, search, options)));
	}

	if (method === 'POST' && pathname === '/ocs/v2.php/references/extractPublic') {
		return responseToSnapshot(await handleExtractPublicReferences(buildRequest(pathname, search, options)));
	}

	if (method === 'GET' && pathname === '/ocs/v2.php/references/resolve') {
		return responseToSnapshot(await handleResolveOne(buildRequest(pathname, search, options)));
	}

	if (method === 'POST' && pathname === '/ocs/v2.php/references/resolve') {
		return responseToSnapshot(await handleResolveMany(buildRequest(pathname, search, options)));
	}

	if (method === 'GET' && pathname === '/ocs/v2.php/references/resolvePublic') {
		return responseToSnapshot(await handleResolveOnePublic(buildRequest(pathname, search, options)));
	}

	if (method === 'POST' && pathname === '/ocs/v2.php/references/resolvePublic') {
		return responseToSnapshot(await handleResolvePublicMany(buildRequest(pathname, search, options)));
	}

	if (method === 'GET' && pathname === '/ocs/v2.php/references/providers') {
		return responseToSnapshot(await handleGetProvidersInfo(buildRequest(pathname, search, options)));
	}

	const touchMatch = /^\/ocs\/v2\.php\/references\/provider\/([^/]+)$/.exec(pathname);

	if (method === 'PUT' && touchMatch) {
		const providerId = decodeURIComponent(touchMatch[1]);

		return responseToSnapshot(await handleTouchProvider(buildRequest(pathname, search, options), providerId));
	}

	return null;
}
