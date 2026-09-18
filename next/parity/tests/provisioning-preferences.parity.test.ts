import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatParityMismatches, runParityCase } from '../harness';
import {
	resetParityProvisioningStores,
	setParityPreferenceFixtureListener,
} from '../helpers/provisioning-self-read';
import {
	PARITY_FIXTURE_APP_ID,
	PARITY_FIXTURE_CONFIG_KEY,
} from '@/src/server/provisioning/preference-events';
import { basicAuthHeader, OCS_JSON_HEADERS, OCS_META_PATHS } from '../helpers/session';

const PARITY_PASSWORD = 'parity-test-password';

const OCS_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: OCS_META_PATHS,
};

function aliceHeaders(): Record<string, string> {
	return {
		...OCS_JSON_HEADERS,
		...basicAuthHeader('alice', PARITY_PASSWORD),
	};
}

function jsonBody(body: Record<string, unknown>, headers: Record<string, string>) {
	return {
		method: 'POST' as const,
		headers: {
			...headers,
			'content-type': 'application/json',
		},
		body: JSON.stringify(body),
	};
}

describe('parity: provisioning preferences', () => {
	beforeEach(async () => {
		await resetParityProvisioningStores();
		await setParityPreferenceFixtureListener(false);
	});

	afterEach(async () => {
		await resetParityProvisioningStores();
		await setParityPreferenceFixtureListener(false);
	});

	it('POST preference unauthenticated returns 401/997 (provisioning_api-preferences-set-preference)', async () => {
		const result = await runParityCase({
			name: 'provisioning-preference-set-unauth',
			path: '/ocs/v2.php/apps/provisioning_api/api/v1/config/users/parity_fixture/valid_key?format=json',
			options: jsonBody({ configValue: 'test' }, OCS_JSON_HEADERS),
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST preference unknown app/key without listener returns HTTP 400 empty data (provisioning_api-preferences-set-preference)', async () => {
		const result = await runParityCase({
			name: 'provisioning-preference-set-unknown',
			path: '/ocs/v2.php/apps/provisioning_api/api/v1/config/users/unknown_app/unknown_key?format=json',
			options: jsonBody({ configValue: 'test' }, aliceHeaders()),
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

	it('POST multiple preferences any invalid key returns HTTP 400 empty data (provisioning_api-preferences-set-multiple-preferences)', async () => {
		await setParityPreferenceFixtureListener(true);

		const result = await runParityCase({
			name: 'provisioning-preference-set-multiple-invalid',
			path: `/ocs/v2.php/apps/provisioning_api/api/v1/config/users/${PARITY_FIXTURE_APP_ID}?format=json`,
			options: jsonBody({
				configs: {
					[PARITY_FIXTURE_CONFIG_KEY]: 'ok',
					invalid_key: 'fail',
				},
			}, aliceHeaders()),
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

	it('POST then DELETE preference with fixture listener returns 200 [] (provisioning_api-preferences-set-preference, provisioning_api-preferences-delete-preference)', async () => {
		await setParityPreferenceFixtureListener(true);

		const setResult = await runParityCase({
			name: 'provisioning-preference-set-happy',
			path: `/ocs/v2.php/apps/provisioning_api/api/v1/config/users/${PARITY_FIXTURE_APP_ID}/${PARITY_FIXTURE_CONFIG_KEY}?format=json`,
			options: jsonBody({ configValue: 'parity-value' }, aliceHeaders()),
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data',
				],
			},
		});

		expect(setResult.mismatches, formatParityMismatches(setResult.mismatches)).toEqual([]);

		const deleteResult = await runParityCase({
			name: 'provisioning-preference-delete-happy',
			path: `/ocs/v2.php/apps/provisioning_api/api/v1/config/users/${PARITY_FIXTURE_APP_ID}/${PARITY_FIXTURE_CONFIG_KEY}?format=json`,
			options: {
				method: 'DELETE',
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

		expect(deleteResult.mismatches, formatParityMismatches(deleteResult.mismatches)).toEqual([]);
	});

	it('DELETE multiple preferences with fixture listener returns 200 [] (provisioning_api-preferences-delete-multiple-preference)', async () => {
		await setParityPreferenceFixtureListener(true);

		const setResult = await runParityCase({
			name: 'provisioning-preference-set-before-multi-delete',
			path: `/ocs/v2.php/apps/provisioning_api/api/v1/config/users/${PARITY_FIXTURE_APP_ID}/${PARITY_FIXTURE_CONFIG_KEY}?format=json`,
			options: jsonBody({ configValue: 'parity-value' }, aliceHeaders()),
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data',
				],
			},
		});

		expect(setResult.mismatches, formatParityMismatches(setResult.mismatches)).toEqual([]);

		const deleteResult = await runParityCase({
			name: 'provisioning-preference-delete-multiple-happy',
			path: `/ocs/v2.php/apps/provisioning_api/api/v1/config/users/${PARITY_FIXTURE_APP_ID}?format=json&configKeys[]=${PARITY_FIXTURE_CONFIG_KEY}`,
			options: {
				method: 'DELETE',
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

		expect(deleteResult.mismatches, formatParityMismatches(deleteResult.mismatches)).toEqual([]);
	});
});
