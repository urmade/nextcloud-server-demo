import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetSessionStore } from '@/src/server/auth/session-store';
import { getAdminFilesHome } from '@/src/server/dav/store';
import type { DavFileNode } from '@/src/server/dav/types';
import { getLatestTransferOwnershipId } from '@/src/server/files/transfer-ownership-store';
import { formatParityMismatches, runParityCase } from '../harness';
import { cookieJarToHeader } from '../helpers/cookies';
import { resetParityFilesStores } from '../helpers/files';
import { getFilenamesSessionId, seedNonAdminSession } from '../legacy-mock/files-filenames';
import {
	loginParitySession,
	loginParitySessionWithCsrf,
	OCS_JSON_HEADERS,
	OCS_META_PATHS,
} from '../helpers/session';
import { getParityEnv } from '../env';
import { fetchLegacyMockSnapshot } from '../legacy-mock/adapter';

const OPEN_LOCAL_CREATE_PATH = '/ocs/v2.php/apps/files/api/v1/openlocaleditor?format=json';
const CONVERT_PATH = '/ocs/v2.php/apps/files/api/v1/convert?format=json';
const FOLDER_TREE_PATH = '/ocs/v2.php/apps/files/api/v1/folder-tree?format=json';
const TRANSFER_PATH = '/ocs/v2.php/apps/files/api/v1/transferownership?format=json';

const OCS_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: OCS_META_PATHS,
};

const OPEN_LOCAL_CREATE_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: [
		...OCS_META_PATHS,
		'ocs.data.userId',
		'ocs.data.pathHash',
		'ocs.data.expirationTime',
		'ocs.data.token',
	],
	unstableIdPaths: ['ocs.data.token', 'ocs.data.expirationTime'],
};

const CONVERT_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: [
		...OCS_META_PATHS,
		'ocs.data.path',
		'ocs.data.fileId',
	],
	unstableIdPaths: ['ocs.data.fileId', 'ocs.data.path'],
};

function findFileIdByName(name: string): number {
	function walk(node: DavFileNode): number | null {
		if (node.kind === 'file' && node.name === name) {
			return node.fileId;
		}

		for (const child of node.children ?? []) {
			const found = walk(child);

			if (found !== null) {
				return found;
			}
		}

		return null;
	}

	const fileId = walk(getAdminFilesHome());

	if (fileId === null) {
		throw new Error(`Missing parity seed file: ${name}`);
	}

	return fileId;
}

async function mintLegacyOpenLocalToken(jar: Record<string, string>, path: string): Promise<string> {
	const snapshot = await fetchLegacyMockSnapshot(OPEN_LOCAL_CREATE_PATH, {
		method: 'POST',
		headers: {
			...OCS_JSON_HEADERS,
			'content-type': 'application/json',
			cookie: cookieJarToHeader(jar) ?? '',
		},
		body: JSON.stringify({ path }),
	});
	const payload = JSON.parse(snapshot.rawBody) as { ocs: { data: { token: string } } };

	return payload.ocs.data.token;
}

async function mintNewOpenLocalToken(jar: Record<string, string>, path: string): Promise<string> {
	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}${OPEN_LOCAL_CREATE_PATH}`, {
		method: 'POST',
		headers: {
			...OCS_JSON_HEADERS,
			'content-type': 'application/json',
			cookie: cookieJarToHeader(jar) ?? '',
		},
		body: JSON.stringify({ path }),
	});
	const payload = await response.json() as { ocs: { data: { token: string } } };

	return payload.ocs.data.token;
}

describe('parity: files-remaining-ocs', () => {
	beforeEach(async () => {
		await resetParityFilesStores();
	});

	afterEach(async () => {
		resetSessionStore();
		await resetParityFilesStores();
	});

	it('POST openlocaleditor requires auth (401)', async () => {
		const result = await runParityCase({
			name: 'open-local-create-unauth',
			path: OPEN_LOCAL_CREATE_PATH,
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
				},
				body: JSON.stringify({ path: '/welcome.txt' }),
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST openlocaleditor creates token with sha1 pathHash', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'open-local-create-happy',
			path: OPEN_LOCAL_CREATE_PATH,
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({ path: '/welcome.txt' }),
			},
			compare: OPEN_LOCAL_CREATE_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST openlocaleditor validate is one-shot', async () => {
		const env = getParityEnv();
		const jar = await loginParitySession();
		const path = '/welcome.txt';
		const headers = {
			...OCS_JSON_HEADERS,
			'content-type': 'application/json',
			cookie: cookieJarToHeader(jar) ?? '',
		};
		const body = JSON.stringify({ path });

		const [legacyToken, newToken] = await Promise.all([
			mintLegacyOpenLocalToken(jar, path),
			mintNewOpenLocalToken(jar, path),
		]);

		const legacyValidatePath = `/ocs/v2.php/apps/files/api/v1/openlocaleditor/${legacyToken}?format=json`;
		const newValidatePath = `/ocs/v2.php/apps/files/api/v1/openlocaleditor/${newToken}?format=json`;

		const [legacyFirst, newFirst, legacySecond, newSecond] = await Promise.all([
			fetchLegacyMockSnapshot(legacyValidatePath, { method: 'POST', headers, body }),
			fetch(`${env.newBaseUrl}${newValidatePath}`, { method: 'POST', headers, body }),
			fetchLegacyMockSnapshot(legacyValidatePath, { method: 'POST', headers, body }),
			fetch(`${env.newBaseUrl}${newValidatePath}`, { method: 'POST', headers, body }),
		]);

		expect(legacyFirst.status).toBe(200);
		expect(newFirst.status).toBe(200);
		expect(legacySecond.status).toBe(404);
		expect(newSecond.status).toBe(404);
	});

	it('GET folder-tree requires auth (401 raw JSON)', async () => {
		const result = await runParityCase({
			name: 'folder-tree-unauth',
			path: FOLDER_TREE_PATH,
			options: {
				headers: {
					Accept: 'application/json',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: ['message'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET folder-tree requires CSRF even with OCS-APIRequest', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'folder-tree-csrf',
			path: `${FOLDER_TREE_PATH}&path=/`,
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: ['message'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET folder-tree returns directory array at root', async () => {
		const { jar, csrfToken } = await loginParitySessionWithCsrf();

		const result = await runParityCase({
			name: 'folder-tree-happy',
			path: `${FOLDER_TREE_PATH}&path=/`,
			options: {
				headers: {
					Accept: 'application/json',
					requesttoken: csrfToken,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET folder-tree rejects file path (400)', async () => {
		const { jar, csrfToken } = await loginParitySessionWithCsrf();

		const result = await runParityCase({
			name: 'folder-tree-file-path',
			path: `${FOLDER_TREE_PATH}&path=/welcome.txt`,
			options: {
				headers: {
					Accept: 'application/json',
					requesttoken: csrfToken,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: ['message'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST convert returns 404 for unknown fileId', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'convert-unknown-file',
			path: CONVERT_PATH,
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({
					fileId: 999999,
					targetMimeType: 'image/png',
				}),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.meta.message',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST convert returns 400 for destination extension mismatch', async () => {
		const jar = await loginParitySession();
		const fileId = findFileIdByName('photo.jpg');

		const result = await runParityCase({
			name: 'convert-extension-mismatch',
			path: CONVERT_PATH,
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({
					fileId,
					targetMimeType: 'image/png',
					destination: 'photo.jpg',
				}),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.meta.message',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST convert returns 201 with stub provider', async () => {
		const jar = await loginParitySession();
		const fileId = findFileIdByName('photo.jpg');

		const result = await runParityCase({
			name: 'convert-happy',
			path: CONVERT_PATH,
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({
					fileId,
					targetMimeType: 'image/png',
				}),
			},
			compare: CONVERT_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST transferownership rejects unknown recipient (400)', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'transfer-unknown-recipient',
			path: TRANSFER_PATH,
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({
					recipient: 'nobody',
					path: 'welcome.txt',
				}),
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST transferownership then recipient reject and source accept forbidden', async () => {
		const jar = await loginParitySession();
		const headers = {
			...OCS_JSON_HEADERS,
			'content-type': 'application/json',
			cookie: cookieJarToHeader(jar) ?? '',
		};

		const transferResult = await runParityCase({
			name: 'transfer-happy',
			path: TRANSFER_PATH,
			options: {
				method: 'POST',
				headers,
				body: JSON.stringify({
					recipient: 'alice',
					path: 'welcome.txt',
				}),
			},
			compare: OCS_COMPARE,
		});

		expect(transferResult.mismatches, formatParityMismatches(transferResult.mismatches)).toEqual([]);

		const transferId = getLatestTransferOwnershipId();

		expect(transferId).not.toBeNull();

		const sessionId = getFilenamesSessionId({ headers: { cookie: cookieJarToHeader(jar) ?? '' } });

		if (sessionId) {
			seedNonAdminSession(sessionId, 'alice');
		}

		const rejectPath = `/ocs/v2.php/apps/files/api/v1/transferownership/${transferId}?format=json`;

		const rejectResult = await runParityCase({
			name: 'transfer-recipient-reject',
			path: rejectPath,
			options: {
				method: 'DELETE',
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: OCS_COMPARE,
		});

		expect(rejectResult.mismatches, formatParityMismatches(rejectResult.mismatches)).toEqual([]);

		await runParityCase({
			name: 'transfer-reseed',
			path: TRANSFER_PATH,
			options: {
				method: 'POST',
				headers,
				body: JSON.stringify({
					recipient: 'alice',
					path: 'welcome.txt',
				}),
			},
			compare: OCS_COMPARE,
		});

		const acceptId = getLatestTransferOwnershipId();
		const acceptPath = `/ocs/v2.php/apps/files/api/v1/transferownership/${acceptId}?format=json`;

		const sourceAccept = await runParityCase({
			name: 'transfer-source-accept-forbidden',
			path: acceptPath,
			options: {
				method: 'POST',
				headers,
			},
			compare: OCS_COMPARE,
		});

		expect(sourceAccept.mismatches, formatParityMismatches(sourceAccept.mismatches)).toEqual([]);
	});

	it('POST transferownership accept as recipient returns 200', async () => {
		const jar = await loginParitySession();
		const headers = {
			...OCS_JSON_HEADERS,
			'content-type': 'application/json',
			cookie: cookieJarToHeader(jar) ?? '',
		};

		await runParityCase({
			name: 'transfer-accept-seed',
			path: TRANSFER_PATH,
			options: {
				method: 'POST',
				headers,
				body: JSON.stringify({
					recipient: 'alice',
					path: 'welcome.txt',
				}),
			},
			compare: OCS_COMPARE,
		});

		const transferId = getLatestTransferOwnershipId();
		const sessionId = getFilenamesSessionId({ headers: { cookie: cookieJarToHeader(jar) ?? '' } });

		if (sessionId) {
			seedNonAdminSession(sessionId, 'alice');
		}

		const acceptPath = `/ocs/v2.php/apps/files/api/v1/transferownership/${transferId}?format=json`;

		const result = await runParityCase({
			name: 'transfer-recipient-accept',
			path: acceptPath,
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});
