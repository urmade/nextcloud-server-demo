import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	generateUnifiedSearchProvidersETag,
	getUnifiedSearchProviders,
} from '@/src/server/ocs/unified-search';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';
import { snapshotResponse } from '../compare';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/legacy');

function loadFixture(name: string): unknown {
	const filePath = path.join(fixturesDir, name);

	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function jsonSnapshot(
	status: number,
	body: unknown,
	contentType = 'application/json; charset=utf-8',
	extraHeaders: Record<string, string> = {},
): ParityResponseSnapshot {
	const rawBody = JSON.stringify(body);

	return snapshotResponse(
		new Response(rawBody, {
			status,
			headers: {
				'content-type': contentType,
				...extraHeaders,
			},
		}),
		rawBody,
	);
}

export function handleUnifiedSearchMock(
	fullPath: string,
	options: ParityRequestOptions,
	isAuthenticated: boolean,
	unauthorizedSnapshot: () => ParityResponseSnapshot,
): ParityResponseSnapshot | null {
	const pathname = fullPath.split('?')[0];

	if (pathname === '/ocs/v2.php/search/providers') {
		if (!isAuthenticated) {
			return unauthorizedSnapshot();
		}

		const providers = getUnifiedSearchProviders();
		const etag = generateUnifiedSearchProvidersETag(providers);

		return jsonSnapshot(200, loadFixture('ocs-v2-unified-search-providers.json'), 'application/json; charset=utf-8', {
			etag,
		});
	}

	const searchMatch = /^\/ocs\/v2\.php\/search\/providers\/([^/]+)\/search$/.exec(pathname);

	if (!searchMatch) {
		return null;
	}

	if (!isAuthenticated) {
		return unauthorizedSnapshot();
	}

	const providerId = decodeURIComponent(searchMatch[1]);
	const url = new URL(`http://127.0.0.1:3100${fullPath.startsWith('/') ? fullPath : `/${fullPath}`}`);
	const term = url.searchParams.get('term');

	if (providerId === 'parity-users' && term === 'ali') {
		return jsonSnapshot(200, loadFixture('ocs-v2-unified-search-users-ali.json'));
	}

	if (!term || term.trim().length === 0) {
		return jsonSnapshot(400, loadFixture('ocs-v2-unified-search-no-filters.json'));
	}

	return jsonSnapshot(400, loadFixture('ocs-v2-unified-search-no-filters.json'));
}
