import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatParityMismatches, runParityCase } from '../harness';
import { cookieJarToHeader } from '../helpers/cookies';
import { resetParityProvisioningStores, removeParityProvisioningEmail, setParityWelcomeMailSendFails } from '../helpers/provisioning-self-read';
import {
	basicAuthHeader,
	expireParityPasswordConfirmation,
	loginParitySession,
	loginParitySessionWithCsrf,
	OCS_JSON_HEADERS,
	OCS_META_PATHS,
} from '../helpers/session';
import { getSessionIdFromOptions, seedNonAdminSession } from '../legacy-mock/two-factor';
import { getParityEnv } from '../env';
import {
	createProvisioningUser,
	setProvisioningSubadminGroups,
} from '@/src/server/provisioning/store';

const PARITY_PASSWORD = 'parity-test-password';

const OCS_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: OCS_META_PATHS,
};

function adminHeaders(jar?: Record<string, string>): Record<string, string> {
	return {
		...OCS_JSON_HEADERS,
		...basicAuthHeader('admin', PARITY_PASSWORD),
		...(jar ? { cookie: cookieJarToHeader(jar) ?? '' } : {}),
	};
}

function aliceHeaders(jar?: Record<string, string>): Record<string, string> {
	return {
		...OCS_JSON_HEADERS,
		...basicAuthHeader('alice', PARITY_PASSWORD),
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

describe('parity: provisioning users lifecycle', () => {
	beforeEach(async () => {
		await resetParityProvisioningStores();
	});

	afterEach(async () => {
		await resetParityProvisioningStores();
	});

	it('POST /ocs/v2.php/cloud/users unauthenticated returns 401/997 (provisioning_api-users-add-user)', async () => {
		const result = await runParityCase({
			name: 'provisioning-users-add-unauth',
			path: '/ocs/v2.php/cloud/users?format=json',
			options: {
				method: 'POST',
				headers: OCS_JSON_HEADERS,
				body: JSON.stringify({ userid: 'new-user', password: 'secret123', groups: ['parity-users'] }),
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/cloud/users without password confirmation returns 403 (provisioning_api-users-add-user)', async () => {
		const { jar } = await loginParitySessionWithCsrf();
		await expireParityPasswordConfirmation(jar);

		const result = await runParityCase({
			name: 'provisioning-users-add-no-confirm',
			path: '/ocs/v2.php/cloud/users?format=json',
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({ userid: 'new-user', password: 'secret123', groups: ['parity-users'] }),
			},
			compare: {
				contractHeaders: ['content-type', 'x-nc-auth-notconfirmed'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/cloud/users existing user returns 102 (provisioning_api-users-add-user)', async () => {
		const result = await runParityCase({
			name: 'provisioning-users-add-exists',
			path: '/ocs/v2.php/cloud/users?format=json',
			options: {
				method: 'POST',
				headers: adminHeaders(),
				body: JSON.stringify({ userid: 'alice', password: 'secret123', groups: ['parity-users'] }),
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/cloud/users empty password without email returns 108 (provisioning_api-users-add-user)', async () => {
		const result = await runParityCase({
			name: 'provisioning-users-add-no-password-email',
			path: '/ocs/v2.php/cloud/users?format=json',
			options: {
				method: 'POST',
				headers: adminHeaders(),
				body: JSON.stringify({ userid: 'new-user-no-email', password: '', groups: ['parity-users'] }),
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/cloud/users as subadmin without groups returns 106 (provisioning_api-users-add-user)', async () => {
		await seedProvisioningFixture({
			subadminUserId: 'alice',
			subadminGroups: ['parity-users'],
		});

		const result = await runParityCase({
			name: 'provisioning-users-add-subadmin-no-groups',
			path: '/ocs/v2.php/cloud/users?format=json',
			options: {
				method: 'POST',
				headers: aliceHeaders(),
				body: JSON.stringify({ userid: 'subadmin-user', password: 'secret123' }),
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('DELETE /ocs/v2.php/cloud/users/{userId} self returns 101 (provisioning_api-users-delete-user)', async () => {
		const result = await runParityCase({
			name: 'provisioning-users-delete-self',
			path: '/ocs/v2.php/cloud/users/admin?format=json',
			options: {
				method: 'DELETE',
				headers: adminHeaders(),
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('DELETE /ocs/v2.php/cloud/users/{userId} peer as ordinary user returns 403 (provisioning_api-users-delete-user)', async () => {
		const jar = await loginParitySession();
		const sessionId = getSessionIdFromOptions({ headers: { cookie: cookieJarToHeader(jar) ?? '' } });

		if (sessionId) {
			seedNonAdminSession(sessionId, 'alice');
		}

		const result = await runParityCase({
			name: 'provisioning-users-delete-ordinary-forbidden',
			path: '/ocs/v2.php/cloud/users/admin?format=json',
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

	it('PUT /ocs/v2.php/cloud/users/{userId}/enable self returns 101 (provisioning_api-users-enable-user)', async () => {
		const result = await runParityCase({
			name: 'provisioning-users-enable-self',
			path: '/ocs/v2.php/cloud/users/admin/enable?format=json',
			options: {
				method: 'PUT',
				headers: adminHeaders(),
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/cloud/users/{userId}/wipe self returns 101 (provisioning_api-users-wipe-user-devices)', async () => {
		const result = await runParityCase({
			name: 'provisioning-users-wipe-self',
			path: '/ocs/v2.php/cloud/users/admin/wipe?format=json',
			options: {
				method: 'POST',
				headers: adminHeaders(),
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/cloud/users/{userId}/welcome without email returns 101 (provisioning_api-users-resend-welcome-message)', async () => {
		const env = getParityEnv();
		const createResponse = await fetch(`${env.newBaseUrl}/ocs/v2.php/cloud/users?format=json`, {
			method: 'POST',
			headers: adminHeaders(),
			body: JSON.stringify({
				userid: 'no-email-user',
				password: 'secret123',
				groups: ['parity-users'],
				email: 'no-email-user@parity.test',
			}),
		});

		if (!createResponse.ok) {
			throw new Error(`Failed to seed no-email user on HTTP server (${createResponse.status})`);
		}

		createProvisioningUser({
			userid: 'no-email-user',
			password: 'secret123',
			groups: ['parity-users'],
			email: 'no-email-user@parity.test',
		});
		await removeParityProvisioningEmail('no-email-user', 'no-email-user@parity.test');

		const result = await runParityCase({
			name: 'provisioning-users-welcome-no-email',
			path: '/ocs/v2.php/cloud/users/no-email-user/welcome?format=json',
			options: {
				method: 'POST',
				headers: adminHeaders(),
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/cloud/users/{userId}/welcome send failure returns 102 (provisioning_api-users-resend-welcome-message)', async () => {
		setParityWelcomeMailSendFails(true);

		const result = await runParityCase({
			name: 'provisioning-users-welcome-send-fail',
			path: '/ocs/v2.php/cloud/users/alice/welcome?format=json',
			options: {
				method: 'POST',
				headers: adminHeaders(),
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});
