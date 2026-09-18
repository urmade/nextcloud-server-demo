import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatParityMismatches, runParityCase } from '../harness';
import { cookieJarToHeader } from '../helpers/cookies';
import { resetParityProvisioningStores } from '../helpers/provisioning-self-read';
import {
	basicAuthHeader,
	loginParitySession,
	OCS_JSON_HEADERS,
	OCS_META_PATHS,
} from '../helpers/session';
import { getSessionIdFromOptions, seedNonAdminSession } from '../legacy-mock/two-factor';

const PARITY_PASSWORD = 'parity-test-password';

const OCS_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: OCS_META_PATHS,
};

function aliceHeaders(jar?: Record<string, string>): Record<string, string> {
	return {
		...OCS_JSON_HEADERS,
		...basicAuthHeader('alice', PARITY_PASSWORD),
		...(jar ? { cookie: cookieJarToHeader(jar) ?? '' } : {}),
	};
}

function adminHeaders(jar?: Record<string, string>): Record<string, string> {
	return {
		...OCS_JSON_HEADERS,
		...basicAuthHeader('admin', PARITY_PASSWORD),
		...(jar ? { cookie: cookieJarToHeader(jar) ?? '' } : {}),
	};
}

describe('parity: provisioning self-read', () => {
	beforeEach(async () => {
		await resetParityProvisioningStores();
	});

	afterEach(async () => {
		await resetParityProvisioningStores();
	});

	it('GET /ocs/v2.php/cloud/user unauthenticated returns 401/997 (provisioning_api-users-get-current-user)', async () => {
		const result = await runParityCase({
			name: 'provisioning-current-user-unauth',
			path: '/ocs/v2.php/cloud/user?format=json',
			options: {
				headers: OCS_JSON_HEADERS,
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/cloud/user self returns details with scopes (provisioning_api-users-get-current-user)', async () => {
		const result = await runParityCase({
			name: 'provisioning-current-user-self',
			path: '/ocs/v2.php/cloud/user?format=json',
			options: {
				headers: aliceHeaders(),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.id',
					'ocs.data.displayname',
					'ocs.data.display-name',
					'ocs.data.emailScope',
					'ocs.data.displaynameScope',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/cloud/user/fields returns editable properties without avatar (provisioning_api-users-get-editable-fields)', async () => {
		const result = await runParityCase({
			name: 'provisioning-editable-fields-self',
			path: '/ocs/v2.php/cloud/user/fields?format=json',
			options: {
				headers: aliceHeaders(),
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

	it('GET /ocs/v2.php/cloud/user/fields/{other} without manage returns 998 (provisioning_api-users-get-editable-fields-for-user)', async () => {
		const result = await runParityCase({
			name: 'provisioning-editable-fields-peer',
			path: '/ocs/v2.php/cloud/user/fields/admin?format=json',
			options: {
				headers: aliceHeaders(),
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/cloud/users/{self} includes scopes (provisioning_api-users-get-user)', async () => {
		const result = await runParityCase({
			name: 'provisioning-get-user-self',
			path: '/ocs/v2.php/cloud/users/alice?format=json',
			options: {
				headers: aliceHeaders(),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.id',
					'ocs.data.displayname',
					'ocs.data.display-name',
					'ocs.data.emailScope',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/cloud/users/{peer} returns 998 (provisioning_api-users-get-user)', async () => {
		const result = await runParityCase({
			name: 'provisioning-get-user-peer',
			path: '/ocs/v2.php/cloud/users/admin?format=json',
			options: {
				headers: aliceHeaders(),
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/cloud/users/{missing} returns 998 (provisioning_api-users-get-user)', async () => {
		const result = await runParityCase({
			name: 'provisioning-get-user-missing',
			path: '/ocs/v2.php/cloud/users/missing-user?format=json',
			options: {
				headers: aliceHeaders(),
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

	it('GET /ocs/v2.php/cloud/user/apps as ordinary user returns 403 (provisioning_api-users-get-enabled-apps)', async () => {
		const jar = await loginParitySession();
		const sessionId = getSessionIdFromOptions({ headers: { cookie: cookieJarToHeader(jar) ?? '' } });

		if (sessionId) {
			seedNonAdminSession(sessionId, 'alice');
		}

		const result = await runParityCase({
			name: 'provisioning-enabled-apps-ordinary',
			path: '/ocs/v2.php/cloud/user/apps?format=json',
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

	it('GET /ocs/v2.php/cloud/user/apps as admin returns apps array (provisioning_api-users-get-enabled-apps)', async () => {
		const result = await runParityCase({
			name: 'provisioning-enabled-apps-admin',
			path: '/ocs/v2.php/cloud/user/apps?format=json',
			options: {
				headers: adminHeaders(),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.apps',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});
