import { afterEach, describe, expect, it } from 'vitest';
import { resetDirectLinkStore } from '@/src/server/dav/direct-store';
import { resetDavFileStore } from '@/src/server/dav/store';
import { getParityEnv } from '../env';
import { formatParityMismatches, runParityCase } from '../harness';
import { fetchLegacyMockSnapshot } from '../legacy-mock/adapter';
import { compareBinarySnapshots, snapshotBinaryResponse } from '../helpers/binary';
import { cookieJarToHeader } from '../helpers/cookies';
import { loginParitySession, OCS_JSON_HEADERS, OCS_META_PATHS } from '../helpers/session';

const WELCOME_FILE_ID = 1001;
const DOCUMENTS_FOLDER_ID = 1002;
const DIRECT_OCS_PATH = '/ocs/v2.php/apps/dav/api/v1/direct?format=json';

function extractDirectToken(url: string): string {
	const match = /\/remote\.php\/direct\/([^/?#]+)/.exec(url);

	if (!match) {
		throw new Error(`Could not extract direct token from URL: ${url}`);
	}

	return match[1];
}

async function mintLegacyDirectUrl(
	jar: Record<string, string>,
	body: Record<string, unknown>,
): Promise<string> {
	const snapshot = await fetchLegacyMockSnapshot(DIRECT_OCS_PATH, {
		method: 'POST',
		headers: {
			...OCS_JSON_HEADERS,
			'content-type': 'application/json',
			cookie: cookieJarToHeader(jar) ?? '',
		},
		body: JSON.stringify(body),
	});
	const payload = JSON.parse(snapshot.rawBody) as { ocs: { data: { url: string } } };

	if (snapshot.status !== 200) {
		throw new Error(`Legacy mint failed with status ${snapshot.status}`);
	}

	return payload.ocs.data.url;
}

async function mintNewDirectUrl(
	jar: Record<string, string>,
	body: Record<string, unknown>,
): Promise<string> {
	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}${DIRECT_OCS_PATH}`, {
		method: 'POST',
		redirect: 'manual',
		headers: {
			...OCS_JSON_HEADERS,
			'content-type': 'application/json',
			cookie: cookieJarToHeader(jar) ?? '',
		},
		body: JSON.stringify(body),
	});
	const payload = await response.json() as { ocs: { data: { url: string } } };

	if (response.status !== 200) {
		throw new Error(`Mint failed with status ${response.status}`);
	}

	return payload.ocs.data.url;
}

async function fetchLegacyDirectResponse(path: string, options: { method?: string; headers?: Record<string, string>; body?: string } = {}) {
	const snapshot = await fetchLegacyMockSnapshot(path, options);

	return new Response(snapshot.rawBody, {
		status: snapshot.status,
		headers: snapshot.headers,
	});
}

describe('parity: dav direct', () => {
	afterEach(() => {
		resetDavFileStore();
		resetDirectLinkStore();
	});

	it('POST dav-direct-get-url mint then GET dav.Direct#get returns 200 file bytes', async () => {
		const env = getParityEnv();
		const jar = await loginParitySession();

		const [legacyUrl, newUrl] = await Promise.all([
			mintLegacyDirectUrl(jar, { fileId: WELCOME_FILE_ID }),
			mintNewDirectUrl(jar, { fileId: WELCOME_FILE_ID }),
		]);

		const legacyPath = `/remote.php/direct/${extractDirectToken(legacyUrl)}`;
		const newPath = `/remote.php/direct/${extractDirectToken(newUrl)}`;

		const [legacyResponse, newResponse] = await Promise.all([
			fetchLegacyDirectResponse(legacyPath),
			fetch(`${env.newBaseUrl}${newPath}`, { redirect: 'manual' }),
		]);

		const [legacySnapshot, newSnapshot] = await Promise.all([
			snapshotBinaryResponse(legacyResponse),
			snapshotBinaryResponse(newResponse),
		]);

		const mismatches = compareBinarySnapshots(
			legacySnapshot,
			newSnapshot,
			['content-length', 'etag'],
			Object.fromEntries(legacyResponse.headers.entries()),
			Object.fromEntries(newResponse.headers.entries()),
		);

		expect(mismatches, mismatches.map((m) => m.message).join('\n')).toEqual([]);
	});

	it('POST dav-direct-get-url unauthenticated returns 401/997', async () => {
		const result = await runParityCase({
			name: 'dav-direct-mint-unauthenticated',
			path: DIRECT_OCS_PATH,
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
				},
				body: JSON.stringify({ fileId: WELCOME_FILE_ID }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST dav-direct-get-url folder fileId returns 400', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'dav-direct-mint-folder-file-id',
			path: DIRECT_OCS_PATH,
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({ fileId: DOCUMENTS_FOLDER_ID }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET dav.Direct#get unknown token returns 404', async () => {
		const result = await runParityCase({
			name: 'dav-direct-get-unknown-token',
			path: '/remote.php/direct/invalidtoken0000000000000000000000000000000000000000',
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET dav.Direct#get expired token returns 404', async () => {
		const env = getParityEnv();
		const jar = await loginParitySession();

		const [legacyUrl, newUrl] = await Promise.all([
			mintLegacyDirectUrl(jar, { fileId: WELCOME_FILE_ID, expirationTime: 1 }),
			mintNewDirectUrl(jar, { fileId: WELCOME_FILE_ID, expirationTime: 1 }),
		]);

		await new Promise((resolve) => {
			setTimeout(resolve, 2100);
		});

		const legacyPath = `/remote.php/direct/${extractDirectToken(legacyUrl)}`;
		const newPath = `/remote.php/direct/${extractDirectToken(newUrl)}`;

		const [legacyResponse, newResponse] = await Promise.all([
			fetchLegacyDirectResponse(legacyPath),
			fetch(`${env.newBaseUrl}${newPath}`, { redirect: 'manual' }),
		]);

		expect(legacyResponse.status).toBe(404);
		expect(newResponse.status).toBe(404);
		expect(legacyResponse.headers.get('content-type')).toBe(newResponse.headers.get('content-type'));
	});

	it('PUT dav.Direct#get on token returns 403', async () => {
		const env = getParityEnv();
		const jar = await loginParitySession();

		const [legacyUrl, newUrl] = await Promise.all([
			mintLegacyDirectUrl(jar, { fileId: WELCOME_FILE_ID }),
			mintNewDirectUrl(jar, { fileId: WELCOME_FILE_ID }),
		]);

		const legacyPath = `/remote.php/direct/${extractDirectToken(legacyUrl)}`;
		const newPath = `/remote.php/direct/${extractDirectToken(newUrl)}`;
		const putOptions = {
			method: 'PUT',
			headers: {
				'content-type': 'application/octet-stream',
			},
			body: 'blocked',
		};

		const [legacyResponse, newResponse] = await Promise.all([
			fetchLegacyDirectResponse(legacyPath, putOptions),
			fetch(`${env.newBaseUrl}${newPath}`, { ...putOptions, redirect: 'manual' }),
		]);

		expect(legacyResponse.status).toBe(403);
		expect(newResponse.status).toBe(403);
		expect(legacyResponse.headers.get('content-type')).toBe(newResponse.headers.get('content-type'));
	});
});
