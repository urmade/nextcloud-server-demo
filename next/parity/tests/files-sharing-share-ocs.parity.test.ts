import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetSessionStore } from '@/src/server/auth/session-store';
import { formatParityMismatches, runParityCase } from '../harness';
import { cookieJarToHeader } from '../helpers/cookies';
import { resetParityFilesStores } from '../helpers/files';
import { resetParityShareStores } from '../helpers/files-sharing';
import { getFilenamesSessionId, seedNonAdminSession } from '../legacy-mock/files-filenames';
import {
	loginParitySession,
	OCS_JSON_HEADERS,
	OCS_META_PATHS,
} from '../helpers/session';

const SHARES_PATH = '/ocs/v2.php/apps/files_sharing/api/v1/shares?format=json';
const SHAREES_PATH = '/ocs/v2.php/apps/files_sharing/api/v1/sharees?format=json';
const SHAREES_RECOMMENDED_PATH = '/ocs/v2.php/apps/files_sharing/api/v1/sharees_recommended?format=json';
const INHERITED_PATH = '/ocs/v2.php/apps/files_sharing/api/v1/shares/inherited?format=json';
const PENDING_PATH = '/ocs/v2.php/apps/files_sharing/api/v1/shares/pending?format=json';
const TOKEN_PATH = '/ocs/v2.php/apps/files_sharing/api/v1/token?format=json';

const OCS_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: OCS_META_PATHS,
};

const SHARE_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: [
		...OCS_META_PATHS,
		'ocs.data.share_type',
		'ocs.data.path',
		'ocs.data.permissions',
		'ocs.data.share_with',
		'ocs.data.token',
		'ocs.data.url',
	],
	unstableIdPaths: [
		'ocs.data.id',
		'ocs.data.stime',
		'ocs.data.token',
		'ocs.data.url',
		'ocs.data.item_mtime',
	],
};

const SHARE_LIST_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: OCS_META_PATHS,
};

async function seedShareOnBothSides(
	jar: Record<string, string>,
	body: Record<string, unknown>,
): Promise<void> {
	const result = await runParityCase({
		name: 'seed-share',
		path: SHARES_PATH,
		options: {
			method: 'POST',
			headers: {
				...OCS_JSON_HEADERS,
				'content-type': 'application/json',
				cookie: cookieJarToHeader(jar) ?? '',
			},
			body: JSON.stringify(body),
		},
		compare: SHARE_COMPARE,
	});

	expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
}

describe('parity: files-sharing-share-ocs', () => {
	beforeEach(async () => {
		await resetParityFilesStores();
		await resetParityShareStores();
	});

	afterEach(async () => {
		resetSessionStore();
		await resetParityFilesStores();
		await resetParityShareStores();
	});

	it('GET shares requires auth (401/997)', async () => {
		const result = await runParityCase({
			name: 'get-shares-unauth',
			path: SHARES_PATH,
			options: {
				headers: OCS_JSON_HEADERS,
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST create share without path returns 404', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'create-share-missing-path',
			path: SHARES_PATH,
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({ shareType: 0, shareWith: 'alice' }),
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

	it('POST create user share', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'create-user-share',
			path: SHARES_PATH,
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({
					path: '/welcome.txt',
					shareType: 0,
					shareWith: 'alice',
				}),
			},
			compare: SHARE_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST create link share returns token and url', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'create-link-share',
			path: SHARES_PATH,
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({
					path: '/welcome.txt',
					shareType: 3,
				}),
			},
			compare: SHARE_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET share by unknown id returns 404', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'get-share-unknown',
			path: '/ocs/v2.php/apps/files_sharing/api/v1/shares/999999?format=json',
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET shares lists created shares', async () => {
		const jar = await loginParitySession();
		await seedShareOnBothSides(jar, { path: '/welcome.txt', shareType: 3 });

		const result = await runParityCase({
			name: 'get-shares-happy',
			path: SHARES_PATH,
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: SHARE_LIST_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PUT update share permissions', async () => {
		const jar = await loginParitySession();
		await seedShareOnBothSides(jar, { path: '/welcome.txt', shareType: 3 });

		const result = await runParityCase({
			name: 'update-share',
			path: '/ocs/v2.php/apps/files_sharing/api/v1/shares/1?format=json',
			options: {
				method: 'PUT',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({ permissions: 1 }),
			},
			compare: SHARE_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('DELETE share', async () => {
		const jar = await loginParitySession();
		await seedShareOnBothSides(jar, { path: '/welcome.txt', shareType: 3 });

		const result = await runParityCase({
			name: 'delete-share',
			path: '/ocs/v2.php/apps/files_sharing/api/v1/shares/1?format=json',
			options: {
				method: 'DELETE',
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET inherited shares for path', async () => {
		const jar = await loginParitySession();
		await seedShareOnBothSides(jar, { path: '/welcome.txt', shareType: 3 });

		const result = await runParityCase({
			name: 'get-inherited-shares',
			path: `${INHERITED_PATH}&path=/welcome.txt`,
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: SHARE_LIST_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET pending shares and accept', async () => {
		const jar = await loginParitySession();
		await seedShareOnBothSides(jar, {
			path: '/welcome.txt',
			shareType: 0,
			shareWith: 'alice',
		});

		const sessionId = getFilenamesSessionId({ headers: { cookie: cookieJarToHeader(jar) ?? '' } });

		if (sessionId) {
			seedNonAdminSession(sessionId, 'alice');
		}

		const aliceHeaders = {
			...OCS_JSON_HEADERS,
			cookie: cookieJarToHeader(jar) ?? '',
		};

		const pendingResult = await runParityCase({
			name: 'pending-shares',
			path: PENDING_PATH,
			options: {
				headers: aliceHeaders,
			},
			compare: SHARE_LIST_COMPARE,
		});

		expect(pendingResult.mismatches, formatParityMismatches(pendingResult.mismatches)).toEqual([]);

		const acceptResult = await runParityCase({
			name: 'accept-share',
			path: '/ocs/v2.php/apps/files_sharing/api/v1/shares/pending/1?format=json',
			options: {
				method: 'POST',
				headers: aliceHeaders,
			},
			compare: OCS_COMPARE,
		});

		expect(acceptResult.mismatches, formatParityMismatches(acceptResult.mismatches)).toEqual([]);
	});

	it('POST send-share-email for link share', async () => {
		const jar = await loginParitySession();
		await seedShareOnBothSides(jar, { path: '/welcome.txt', shareType: 3 });

		const result = await runParityCase({
			name: 'send-share-email',
			path: '/ocs/v2.php/apps/files_sharing/api/v1/shares/1/send-email?format=json',
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({}),
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET generate-token', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'generate-token',
			path: TOKEN_PATH,
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.token',
				],
				unstableIdPaths: ['ocs.data.token'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET sharees missing itemType returns 400', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'sharees-missing-item-type',
			path: `${SHAREES_PATH}&search=ali`,
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET sharees empty search returns 200 empty sets', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'sharees-empty-search',
			path: `${SHAREES_PATH}&search=&itemType=file`,
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.users',
					'ocs.data.lookupEnabled',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET sharees_recommended requires itemType', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'sharees-recommended-missing-item-type',
			path: SHAREES_RECOMMENDED_PATH,
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET sharees_recommended happy path', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'sharees-recommended-happy',
			path: `${SHAREES_RECOMMENDED_PATH}&itemType=file`,
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});
