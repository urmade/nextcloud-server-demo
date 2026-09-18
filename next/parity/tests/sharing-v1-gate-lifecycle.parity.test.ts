import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetSessionStore } from '@/src/server/auth/session-store';
import { formatParityMismatches, runParityCase } from '../harness';
import { cookieJarToHeader } from '../helpers/cookies';
import {
	enableSharingV1OnBothSides,
	resetParitySharingV1Stores,
	seedShareOnBothSides,
} from '../helpers/sharing-v1';
import {
	loginParitySession,
	OCS_JSON_HEADERS,
	OCS_META_PATHS,
} from '../helpers/session';

const SECRET_PATH = '/ocs/v2.php/apps/sharing/api/v1/secret?format=json';
const SHARE_PATH = '/ocs/v2.php/apps/sharing/api/v1/share?format=json';
const SHARES_PATH = '/ocs/v2.php/apps/sharing/api/v1/shares?format=json';
const RECIPIENTS_PATH = '/ocs/v2.php/apps/sharing/api/v1/recipients?format=json';

const OCS_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: OCS_META_PATHS,
};

const SHARE_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: [
		...OCS_META_PATHS,
		'ocs.data.state',
		'ocs.data.owner.user_id',
	],
	unstableIdPaths: [
		'ocs.data.id',
		'ocs.data.last_updated',
		'ocs.data.owner.icon.light',
		'ocs.data.owner.icon.dark',
	],
};

describe('parity: sharing-v1-gate-lifecycle', () => {
	beforeEach(async () => {
		await resetParitySharingV1Stores();
	});

	afterEach(async () => {
		resetSessionStore();
		await resetParitySharingV1Stores();
	});

	it('GET /shares unauthenticated returns 401/997 when API is off', async () => {
		const result = await runParityCase({
			name: 'get-shares-unauth-api-off',
			path: SHARES_PATH,
			options: {
				headers: OCS_JSON_HEADERS,
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /secret unauthenticated returns 501 when API is off', async () => {
		const result = await runParityCase({
			name: 'get-secret-unauth-api-off',
			path: SECRET_PATH,
			options: {
				headers: OCS_JSON_HEADERS,
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

	it('POST /share authenticated returns 501 when API is off', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'create-share-auth-api-off',
			path: SHARE_PATH,
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
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

	it('GET /shares unauthenticated returns 401/997 when API is on', async () => {
		await enableSharingV1OnBothSides();

		const result = await runParityCase({
			name: 'get-shares-unauth-api-on',
			path: SHARES_PATH,
			options: {
				headers: OCS_JSON_HEADERS,
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /secret unauthenticated returns 200 string when API is on', async () => {
		await enableSharingV1OnBothSides();

		const result = await runParityCase({
			name: 'get-secret-unauth-api-on',
			path: SECRET_PATH,
			options: {
				headers: OCS_JSON_HEADERS,
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
				],
				unstableIdPaths: ['ocs.data'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /share authenticated returns 201 draft share', async () => {
		await enableSharingV1OnBothSides();
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'create-share-api-on',
			path: SHARE_PATH,
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: SHARE_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /shares returns list for owner', async () => {
		await enableSharingV1OnBothSides();
		const jar = await loginParitySession();
		await seedShareOnBothSides(jar);

		const result = await runParityCase({
			name: 'get-shares-list',
			path: SHARES_PATH,
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
				unstableIdPaths: [
					'ocs.data[0].id',
					'ocs.data[0].last_updated',
					'ocs.data[0].owner.icon.light',
					'ocs.data[0].owner.icon.dark',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /shares limit=0 returns 400', async () => {
		await enableSharingV1OnBothSides();
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'get-shares-limit-zero',
			path: `${SHARES_PATH}&limit=0`,
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
					'ocs.data',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /shares limit=101 returns 400', async () => {
		await enableSharingV1OnBothSides();
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'get-shares-limit-high',
			path: `${SHARES_PATH}&limit=101`,
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
					'ocs.data',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /share/{id} unknown returns 404', async () => {
		await enableSharingV1OnBothSides();

		const result = await runParityCase({
			name: 'get-share-unknown',
			path: '/ocs/v2.php/apps/sharing/api/v1/share/unknown-share-id?format=json',
			options: {
				method: 'POST',
				headers: OCS_JSON_HEADERS,
				body: JSON.stringify({}),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /share/{id} returns 405', async () => {
		await enableSharingV1OnBothSides();
		const jar = await loginParitySession();
		const shareId = await seedShareOnBothSides(jar);

		const result = await runParityCase({
			name: 'get-share-method-not-allowed',
			path: `/ocs/v2.php/apps/sharing/api/v1/share/${shareId}?format=json`,
			options: {
				headers: OCS_JSON_HEADERS,
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('DELETE own share returns 204 empty body', async () => {
		await enableSharingV1OnBothSides();
		const jar = await loginParitySession();
		const shareId = await seedShareOnBothSides(jar);

		const result = await runParityCase({
			name: 'delete-share-own',
			path: `/ocs/v2.php/apps/sharing/api/v1/share/${shareId}?format=json`,
			options: {
				method: 'DELETE',
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /recipients limit=0 returns 400', async () => {
		await enableSharingV1OnBothSides();
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'recipients-limit-zero',
			path: `${RECIPIENTS_PATH}&limit=0`,
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
					'ocs.data',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});
