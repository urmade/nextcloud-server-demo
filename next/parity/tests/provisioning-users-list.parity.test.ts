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
import { getParityEnv } from '../env';
import {
	setDelegatedUsersAdmin,
	setProvisioningSubadminGroups,
	setProvisioningUserEnabled,
	setProvisioningUserLastLogin,
} from '@/src/server/provisioning/store';

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

async function seedProvisioningFixture(body: Record<string, unknown>): Promise<void> {
	setProvisioningSubadminGroups(
		typeof body.subadminUserId === 'string' && Array.isArray(body.subadminGroups)
			? body.subadminUserId
			: 'alice',
		Array.isArray(body.subadminGroups) ? body.subadminGroups as string[] : [],
	);

	if (typeof body.delegatedUserId === 'string' && typeof body.delegatedUsers === 'boolean') {
		setDelegatedUsersAdmin(body.delegatedUserId, body.delegatedUsers);
	}

	if (typeof body.disabledUserId === 'string' && typeof body.disabled === 'boolean') {
		setProvisioningUserEnabled(body.disabledUserId, !body.disabled);
	}

	if (typeof body.lastLoginUserId === 'string' && typeof body.lastLoginTimestamp === 'number') {
		setProvisioningUserLastLogin(body.lastLoginUserId, body.lastLoginTimestamp);
	}

	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/api/parity/seed-provisioning-users`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
		},
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		throw new Error(`Failed to seed provisioning users (${response.status})`);
	}
}

describe('parity: provisioning users list', () => {
	beforeEach(async () => {
		await resetParityProvisioningStores();
	});

	afterEach(async () => {
		await resetParityProvisioningStores();
	});

	it('GET /ocs/v2.php/cloud/users unauthenticated returns 401/997 (provisioning_api-users-get-users)', async () => {
		const result = await runParityCase({
			name: 'provisioning-users-list-unauth',
			path: '/ocs/v2.php/cloud/users?format=json',
			options: {
				headers: OCS_JSON_HEADERS,
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/cloud/users as ordinary user returns 403 (provisioning_api-users-get-users)', async () => {
		const jar = await loginParitySession();
		const sessionId = getSessionIdFromOptions({ headers: { cookie: cookieJarToHeader(jar) ?? '' } });

		if (sessionId) {
			seedNonAdminSession(sessionId, 'alice');
		}

		const result = await runParityCase({
			name: 'provisioning-users-list-ordinary',
			path: '/ocs/v2.php/cloud/users?format=json',
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

	it('GET /ocs/v2.php/cloud/users as subadmin returns only group members (provisioning_api-users-get-users)', async () => {
		await seedProvisioningFixture({
			subadminUserId: 'alice',
			subadminGroups: ['parity-users'],
		});

		const result = await runParityCase({
			name: 'provisioning-users-list-subadmin',
			path: '/ocs/v2.php/cloud/users?format=json',
			options: {
				headers: aliceHeaders(),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.users',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/cloud/users/details as admin includes storageLocation (provisioning_api-users-get-users-details)', async () => {
		const result = await runParityCase({
			name: 'provisioning-users-details-admin',
			path: '/ocs/v2.php/cloud/users/details?format=json',
			options: {
				headers: adminHeaders(),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.users.admin.storageLocation',
					'ocs.data.groups',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/cloud/users/disabled returns users without groups key (provisioning_api-users-get-disabled-users-details)', async () => {
		await seedProvisioningFixture({
			disabledUserId: 'alice',
			disabled: true,
		});

		const result = await runParityCase({
			name: 'provisioning-users-disabled',
			path: '/ocs/v2.php/cloud/users/disabled?format=json',
			options: {
				headers: adminHeaders(),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.users',
				],
				excludeBodyPaths: [
					'ocs.data.groups',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/cloud/users/recent as subadmin without Users returns 403 (provisioning_api-users-get-last-logged-in-users)', async () => {
		await seedProvisioningFixture({
			subadminUserId: 'alice',
			subadminGroups: ['parity-users'],
		});

		const result = await runParityCase({
			name: 'provisioning-users-recent-subadmin-forbidden',
			path: '/ocs/v2.php/cloud/users/recent?format=json',
			options: {
				headers: aliceHeaders(),
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/cloud/users/recent as admin returns users sorted by lastLogin desc (provisioning_api-users-get-last-logged-in-users)', async () => {
		await seedProvisioningFixture({
			lastLoginUserId: 'alice',
			lastLoginTimestamp: 1_900_000_000,
		});

		const result = await runParityCase({
			name: 'provisioning-users-recent-admin',
			path: '/ocs/v2.php/cloud/users/recent?format=json',
			options: {
				headers: adminHeaders(),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.users',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});
