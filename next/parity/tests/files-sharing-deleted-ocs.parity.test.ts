import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetSessionStore } from '@/src/server/auth/session-store';
import { resetDavFileStore } from '@/src/server/dav/store';
import { formatParityMismatches, runParityCase } from '../harness';
import { cookieJarToHeader } from '../helpers/cookies';
import { resetParityFilesStores } from '../helpers/files';
import { resetParityShareStores } from '../helpers/files-sharing';
import {
	basicAuthHeader,
	loginParitySession,
	OCS_JSON_HEADERS,
	OCS_META_PATHS,
} from '../helpers/session';

const DELETED_SHARES_PATH = '/ocs/v2.php/apps/files_sharing/api/v1/deletedshares?format=json';
const SHARES_PATH = '/ocs/v2.php/apps/files_sharing/api/v1/shares?format=json';
const PARITY_GROUP = 'parity-users';
const PARITY_PASSWORD = 'parity-test-password';

const OCS_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: OCS_META_PATHS,
};

const DELETED_LIST_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: [
		...OCS_META_PATHS,
		'ocs.data',
	],
};

const DELETED_SHARE_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: [
		...OCS_META_PATHS,
		'ocs.data.0.id',
		'ocs.data.0.share_type',
		'ocs.data.0.permissions',
		'ocs.data.0.path',
		'ocs.data.0.share_with',
	],
	unstableIdPaths: [
		'ocs.data.0.stime',
		'ocs.data.0.item_mtime',
	],
};

function aliceAuthHeaders(): Record<string, string> {
	return {
		...OCS_JSON_HEADERS,
		...basicAuthHeader('alice', PARITY_PASSWORD),
	};
}

async function resetDeletedOcsStores(): Promise<void> {
	resetDavFileStore();
	await resetParityFilesStores();
	await resetParityShareStores();
}

async function seedGroupShare(jar: Record<string, string>): Promise<void> {
	const result = await runParityCase({
		name: 'seed-group-share',
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
				shareType: 1,
				shareWith: PARITY_GROUP,
			}),
		},
		compare: OCS_COMPARE,
	});

	expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
}

async function deleteShareFromSelfAsAlice(): Promise<void> {
	const result = await runParityCase({
		name: 'delete-group-share-from-self',
		path: '/ocs/v2.php/apps/files_sharing/api/v1/shares/1?format=json',
		options: {
			method: 'DELETE',
			headers: aliceAuthHeaders(),
		},
		compare: OCS_COMPARE,
	});

	expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
}

describe('parity: files-sharing-deleted-ocs', () => {
	beforeEach(async () => {
		resetSessionStore();
		await resetDeletedOcsStores();
	});

	afterEach(async () => {
		resetSessionStore();
		await resetDeletedOcsStores();
	});

	it('GET deletedshares requires auth (401/997)', async () => {
		const result = await runParityCase({
			name: 'deleted-shares-unauth',
			path: DELETED_SHARES_PATH,
			options: {
				headers: OCS_JSON_HEADERS,
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET deletedshares returns empty list', async () => {
		const result = await runParityCase({
			name: 'deleted-shares-empty',
			path: DELETED_SHARES_PATH,
			options: {
				headers: aliceAuthHeaders(),
			},
			compare: DELETED_LIST_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('lists and undeletes a group share removed from self', async () => {
		const jar = await loginParitySession();
		await seedGroupShare(jar);
		await deleteShareFromSelfAsAlice();

		const listResult = await runParityCase({
			name: 'deleted-shares-list',
			path: DELETED_SHARES_PATH,
			options: {
				headers: aliceAuthHeaders(),
			},
			compare: DELETED_SHARE_COMPARE,
		});

		expect(listResult.mismatches, formatParityMismatches(listResult.mismatches)).toEqual([]);

		const undeleteResult = await runParityCase({
			name: 'deleted-shares-undelete',
			path: '/ocs/v2.php/apps/files_sharing/api/v1/deletedshares/ocinternal:1?format=json',
			options: {
				method: 'POST',
				headers: aliceAuthHeaders(),
			},
			compare: DELETED_LIST_COMPARE,
		});

		expect(undeleteResult.mismatches, formatParityMismatches(undeleteResult.mismatches)).toEqual([]);
	});

	it('POST undelete unknown id returns 404', async () => {
		const result = await runParityCase({
			name: 'deleted-shares-undelete-unknown',
			path: '/ocs/v2.php/apps/files_sharing/api/v1/deletedshares/ocinternal:999999?format=json',
			options: {
				method: 'POST',
				headers: aliceAuthHeaders(),
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST undelete active share returns 404', async () => {
		const jar = await loginParitySession();
		await seedGroupShare(jar);

		const result = await runParityCase({
			name: 'deleted-shares-undelete-active',
			path: '/ocs/v2.php/apps/files_sharing/api/v1/deletedshares/ocinternal:1?format=json',
			options: {
				method: 'POST',
				headers: aliceAuthHeaders(),
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});
