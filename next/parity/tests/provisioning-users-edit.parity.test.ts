import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatParityMismatches, runParityCase } from '../harness';
import { resetParityProvisioningStores } from '../helpers/provisioning-self-read';
import {
	basicAuthHeader,
	OCS_JSON_HEADERS,
	OCS_META_PATHS,
} from '../helpers/session';

const PARITY_PASSWORD = 'parity-test-password';

const OCS_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: OCS_META_PATHS,
};

function adminHeaders(): Record<string, string> {
	return {
		...OCS_JSON_HEADERS,
		...basicAuthHeader('admin', PARITY_PASSWORD),
	};
}

function aliceHeaders(): Record<string, string> {
	return {
		...OCS_JSON_HEADERS,
		...basicAuthHeader('alice', PARITY_PASSWORD),
	};
}

describe('parity: provisioning users edit', () => {
	beforeEach(async () => {
		await resetParityProvisioningStores();
	});

	afterEach(async () => {
		await resetParityProvisioningStores();
	});

	it('PUT /ocs/v2.php/cloud/users/{userId} unauthenticated returns 401/997 (provisioning_api-users-edit-user)', async () => {
		const result = await runParityCase({
			name: 'provisioning-users-edit-put-unauth',
			path: '/ocs/v2.php/cloud/users/alice?format=json',
			options: {
				method: 'PUT',
				headers: OCS_JSON_HEADERS,
				body: JSON.stringify({ key: 'displayname', value: 'Alice Updated' }),
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PUT /ocs/v2.php/cloud/users/{userId} forbidden field returns 113 (provisioning_api-users-edit-user)', async () => {
		const result = await runParityCase({
			name: 'provisioning-users-edit-put-forbidden-field',
			path: '/ocs/v2.php/cloud/users/alice?format=json',
			options: {
				method: 'PUT',
				headers: aliceHeaders(),
				body: JSON.stringify({ key: 'quota', value: '5 GB' }),
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PUT /ocs/v2.php/cloud/users/{userId} peer as peer returns 998 (provisioning_api-users-edit-user)', async () => {
		const result = await runParityCase({
			name: 'provisioning-users-edit-put-peer',
			path: '/ocs/v2.php/cloud/users/admin?format=json',
			options: {
				method: 'PUT',
				headers: aliceHeaders(),
				body: JSON.stringify({ key: 'displayname', value: 'Hacked' }),
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PUT /ocs/v2.php/cloud/users/{userId} self displayname returns 200 (provisioning_api-users-edit-user)', async () => {
		const result = await runParityCase({
			name: 'provisioning-users-edit-put-self-displayname',
			path: '/ocs/v2.php/cloud/users/alice?format=json',
			options: {
				method: 'PUT',
				headers: aliceHeaders(),
				body: JSON.stringify({ key: 'displayname', value: 'Alice Updated' }),
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PATCH /ocs/v2.php/cloud/users/{userId} as ordinary user returns 403 (provisioning_api-users-edit-user-multi-field)', async () => {
		const result = await runParityCase({
			name: 'provisioning-users-edit-patch-ordinary-forbidden',
			path: '/ocs/v2.php/cloud/users/alice?format=json',
			options: {
				method: 'PATCH',
				headers: aliceHeaders(),
				body: JSON.stringify({ displayName: 'Alice Updated' }),
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PATCH /ocs/v2.php/cloud/users/{userId} invalid email returns 422 (provisioning_api-users-edit-user-multi-field)', async () => {
		const result = await runParityCase({
			name: 'provisioning-users-edit-patch-invalid-email',
			path: '/ocs/v2.php/cloud/users/alice?format=json',
			options: {
				method: 'PATCH',
				headers: adminHeaders(),
				body: JSON.stringify({ email: 'not-an-email' }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [...OCS_META_PATHS, 'ocs.data.errors.email'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PATCH /ocs/v2.php/cloud/users/{userId} admin updates displayName returns 200 (provisioning_api-users-edit-user-multi-field)', async () => {
		const result = await runParityCase({
			name: 'provisioning-users-edit-patch-admin-displayname',
			path: '/ocs/v2.php/cloud/users/alice?format=json',
			options: {
				method: 'PATCH',
				headers: adminHeaders(),
				body: JSON.stringify({ displayName: 'Alice Patched' }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [...OCS_META_PATHS, 'ocs.data.id', 'ocs.data.displayname'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PUT /ocs/v2.php/cloud/users/{userId}/{collectionName} forbidden collection returns 103 (provisioning_api-users-edit-user-multi-value)', async () => {
		const result = await runParityCase({
			name: 'provisioning-users-edit-multi-value-forbidden',
			path: '/ocs/v2.php/cloud/users/alice/phone?format=json',
			options: {
				method: 'PUT',
				headers: aliceHeaders(),
				body: JSON.stringify({ key: '+123', value: '+456' }),
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PUT /ocs/v2.php/cloud/users/{userId}/additional_mail adds email returns 200 (provisioning_api-users-edit-user-multi-value)', async () => {
		const result = await runParityCase({
			name: 'provisioning-users-edit-multi-value-add-mail',
			path: '/ocs/v2.php/cloud/users/alice/additional_mail?format=json',
			options: {
				method: 'PUT',
				headers: aliceHeaders(),
				body: JSON.stringify({ key: 'extra-old@parity.test', value: 'extra-new@parity.test' }),
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PUT /ocs/v2.php/cloud/users/{userId}/additional_mailScope missing mail returns 102 (provisioning_api-users-edit-user-multi-value)', async () => {
		const result = await runParityCase({
			name: 'provisioning-users-edit-multi-value-missing-mail',
			path: '/ocs/v2.php/cloud/users/alice/additional_mailScope?format=json',
			options: {
				method: 'PUT',
				headers: aliceHeaders(),
				body: JSON.stringify({ key: 'missing@parity.test', value: 'v2-local' }),
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});
