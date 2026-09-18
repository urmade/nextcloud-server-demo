import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetSessionStore } from '@/src/server/auth/session-store';
import { getParityEnv } from '../env';
import { formatParityMismatches, runParityCase } from '../harness';
import { cookieJarToHeader } from '../helpers/cookies';
import { resetParityFilesStores } from '../helpers/files';
import { fetchLegacyMockSnapshot } from '../legacy-mock/adapter';
import { loginParitySession, OCS_JSON_HEADERS, OCS_META_PATHS } from '../helpers/session';

const INFO_PATH = '/ocs/v2.php/apps/files/api/v1/directEditing?format=json';
const OPEN_PATH = '/ocs/v2.php/apps/files/api/v1/directEditing/open?format=json';
const CREATE_PATH = '/ocs/v2.php/apps/files/api/v1/directEditing/create?format=json';
const TEMPLATES_PATH = '/ocs/v2.php/apps/files/api/v1/directEditing/templates/text/textdocument?format=json';

const OCS_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: OCS_META_PATHS,
};

const INFO_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: [
		...OCS_META_PATHS,
		'ocs.data.editors',
		'ocs.data.creators',
	],
};

const OPEN_CREATE_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: OCS_META_PATHS,
	unstableIdPaths: ['ocs.data.url'],
};

const TEMPLATES_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: [
		...OCS_META_PATHS,
		'ocs.data.templates',
	],
};

function extractDirectEditingToken(url: string): string {
	const match = /\/apps\/files\/directEditing\/([^/?#]+)/.exec(url);

	if (!match) {
		throw new Error(`Could not extract direct editing token from URL: ${url}`);
	}

	return match[1];
}

async function mintLegacyDirectEditingUrl(
	jar: Record<string, string>,
	path: string,
	body: Record<string, unknown>,
): Promise<string> {
	const snapshot = await fetchLegacyMockSnapshot(path, {
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

async function mintNewDirectEditingUrl(
	jar: Record<string, string>,
	path: string,
	body: Record<string, unknown>,
): Promise<string> {
	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}${path}`, {
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

describe('parity: files-direct-editing-ocs', () => {
	beforeEach(async () => {
		await resetParityFilesStores();
	});

	afterEach(async () => {
		resetSessionStore();
		await resetParityFilesStores();
	});

	it('GET directEditing info requires auth (401)', async () => {
		const result = await runParityCase({
			name: 'direct-editing-info-unauth',
			path: INFO_PATH,
			options: {
				headers: OCS_JSON_HEADERS,
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET directEditing info returns editors and creators', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'direct-editing-info-happy',
			path: INFO_PATH,
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: INFO_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET directEditing templates returns empty template', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'direct-editing-templates-happy',
			path: TEMPLATES_PATH,
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: TEMPLATES_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST directEditing open returns edit URL', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'direct-editing-open-happy',
			path: OPEN_PATH,
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({
					path: 'welcome.txt',
					editorId: 'text',
				}),
			},
			compare: OPEN_CREATE_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST directEditing create returns edit URL', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'direct-editing-create-happy',
			path: CREATE_PATH,
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({
					path: 'parity-new-doc.txt',
					editorId: 'text',
					creatorId: 'textdocument',
				}),
			},
			compare: OPEN_CREATE_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST directEditing open minted token opens editor page once', async () => {
		const env = getParityEnv();
		const jar = await loginParitySession();

		const [legacyUrl, newUrl] = await Promise.all([
			mintLegacyDirectEditingUrl(jar, OPEN_PATH, { path: 'welcome.txt', editorId: 'text' }),
			mintNewDirectEditingUrl(jar, OPEN_PATH, { path: 'welcome.txt', editorId: 'text' }),
		]);

		const legacyPath = `/apps/files/directEditing/${extractDirectEditingToken(legacyUrl)}`;
		const newPath = `/apps/files/directEditing/${extractDirectEditingToken(newUrl)}`;

		const [legacySnapshot, newResponse, legacySecondSnapshot, newSecond] = await Promise.all([
			fetchLegacyMockSnapshot(legacyPath, { headers: { cookie: cookieJarToHeader(jar) ?? '' } }),
			fetch(`${env.newBaseUrl}${newPath}`, { redirect: 'manual' }),
			fetchLegacyMockSnapshot(legacyPath, { headers: { cookie: cookieJarToHeader(jar) ?? '' } }),
			fetch(`${env.newBaseUrl}${newPath}`, { redirect: 'manual' }),
		]);

		expect(legacySnapshot.status).toBe(200);
		expect(newResponse.status).toBe(200);
		expect(legacySecondSnapshot.status).toBe(404);
		expect(newSecond.status).toBe(404);
	});
});
