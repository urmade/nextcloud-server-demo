import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetSessionStore } from '@/src/server/auth/session-store';
import { resetDavFileStore } from '@/src/server/dav/store';
import {
	SHARE_STATUS_ACCEPTED,
	SHARE_STATUS_PENDING,
	SHARE_TYPE_USER,
} from '@/src/server/files_sharing/constants';
import { formatParityMismatches, runParityCase } from '../harness';
import { resetParityFilesStores } from '../helpers/files';
import { resetParityShareStores, seedExternalShareOnBothSides } from '../helpers/files-sharing';
import {
	basicAuthHeader,
	OCS_JSON_HEADERS,
	OCS_META_PATHS,
} from '../helpers/session';

const REMOTE_PENDING_PATH = '/ocs/v2.php/apps/files_sharing/api/v1/remote_shares/pending?format=json';
const REMOTE_SHARES_PATH = '/ocs/v2.php/apps/files_sharing/api/v1/remote_shares?format=json';
const PARITY_PASSWORD = 'parity-test-password';

const OCS_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: OCS_META_PATHS,
};

const REMOTE_LIST_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: [
		...OCS_META_PATHS,
		'ocs.data',
	],
};

const REMOTE_SHARE_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: [
		...OCS_META_PATHS,
		'ocs.data.id',
		'ocs.data.share_type',
		'ocs.data.accepted',
		'ocs.data.parent',
		'ocs.data.remote',
		'ocs.data.name',
	],
};

function aliceAuthHeaders(): Record<string, string> {
	return {
		...OCS_JSON_HEADERS,
		...basicAuthHeader('alice', PARITY_PASSWORD),
	};
}

async function resetRemoteOcsStores(): Promise<void> {
	resetDavFileStore();
	await resetParityFilesStores();
	await resetParityShareStores();
}

async function seedPendingRemoteShareForAlice(): Promise<string> {
	const share = await seedExternalShareOnBothSides({
		id: '1',
		parent: '-1',
		shareType: SHARE_TYPE_USER,
		remote: 'https://remote.example.com',
		remoteId: 'remote-share-1',
		refreshToken: 'parity-remote-token',
		password: null,
		accessToken: null,
		accessTokenExpires: null,
		name: '/welcome.txt',
		owner: 'remote-owner',
		user: 'alice',
		mountpoint: '{{TemporaryMountPointName#/welcome.txt}}',
		accepted: SHARE_STATUS_PENDING,
	});

	return share.id;
}

describe('parity: files-sharing-remote-ocs', () => {
	beforeEach(async () => {
		resetSessionStore();
		await resetRemoteOcsStores();
	});

	afterEach(async () => {
		resetSessionStore();
		await resetRemoteOcsStores();
	});

	it('GET remote_shares/pending requires auth (401/997)', async () => {
		const result = await runParityCase({
			name: 'remote-pending-unauth',
			path: REMOTE_PENDING_PATH,
			options: {
				headers: OCS_JSON_HEADERS,
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET remote_shares/pending returns empty list', async () => {
		const result = await runParityCase({
			name: 'remote-pending-empty',
			path: REMOTE_PENDING_PATH,
			options: {
				headers: aliceAuthHeaders(),
			},
			compare: REMOTE_LIST_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('lists, accepts, and returns a pending remote share', async () => {
		const shareId = await seedPendingRemoteShareForAlice();

		const listResult = await runParityCase({
			name: 'remote-pending-list',
			path: REMOTE_PENDING_PATH,
			options: {
				headers: aliceAuthHeaders(),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.0.id',
					'ocs.data.0.parent',
					'ocs.data.0.accepted',
					'ocs.data.0.name',
				],
			},
		});

		expect(listResult.mismatches, formatParityMismatches(listResult.mismatches)).toEqual([]);

		const acceptResult = await runParityCase({
			name: 'remote-accept-share',
			path: `/ocs/v2.php/apps/files_sharing/api/v1/remote_shares/pending/${shareId}?format=json`,
			options: {
				method: 'POST',
				headers: aliceAuthHeaders(),
			},
			compare: REMOTE_LIST_COMPARE,
		});

		expect(acceptResult.mismatches, formatParityMismatches(acceptResult.mismatches)).toEqual([]);

		const acceptedResult = await runParityCase({
			name: 'remote-accepted-list',
			path: REMOTE_SHARES_PATH,
			options: {
				headers: aliceAuthHeaders(),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.0.id',
					'ocs.data.0.accepted',
				],
			},
		});

		expect(acceptedResult.mismatches, formatParityMismatches(acceptedResult.mismatches)).toEqual([]);
	});

	it('POST accept unknown id returns 404', async () => {
		const result = await runParityCase({
			name: 'remote-accept-unknown',
			path: '/ocs/v2.php/apps/files_sharing/api/v1/remote_shares/pending/999999?format=json',
			options: {
				method: 'POST',
				headers: aliceAuthHeaders(),
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET remote share unknown id returns 404', async () => {
		const result = await runParityCase({
			name: 'remote-get-share-unknown',
			path: '/ocs/v2.php/apps/files_sharing/api/v1/remote_shares/999999?format=json',
			options: {
				headers: aliceAuthHeaders(),
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET remote share returns object not list', async () => {
		const shareId = await seedPendingRemoteShareForAlice();

		const result = await runParityCase({
			name: 'remote-get-share-object',
			path: `/ocs/v2.php/apps/files_sharing/api/v1/remote_shares/${shareId}?format=json`,
			options: {
				headers: aliceAuthHeaders(),
			},
			compare: REMOTE_SHARE_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('DELETE unshare unknown id returns 404', async () => {
		const result = await runParityCase({
			name: 'remote-unshare-unknown',
			path: '/ocs/v2.php/apps/files_sharing/api/v1/remote_shares/999999?format=json',
			options: {
				method: 'DELETE',
				headers: aliceAuthHeaders(),
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('DELETE unshare accepted share without mount returns 403', async () => {
		const shareId = '2';

		await seedExternalShareOnBothSides({
			id: shareId,
			parent: '-1',
			shareType: SHARE_TYPE_USER,
			remote: 'https://remote.example.com',
			remoteId: 'remote-share-accepted',
			refreshToken: 'parity-remote-token-accepted',
			password: null,
			accessToken: null,
			accessTokenExpires: null,
			name: '/welcome.txt',
			owner: 'remote-owner',
			user: 'alice',
			mountpoint: '',
			accepted: SHARE_STATUS_ACCEPTED,
		});

		const result = await runParityCase({
			name: 'remote-unshare-forbidden',
			path: `/ocs/v2.php/apps/files_sharing/api/v1/remote_shares/${shareId}?format=json`,
			options: {
				method: 'DELETE',
				headers: aliceAuthHeaders(),
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});
