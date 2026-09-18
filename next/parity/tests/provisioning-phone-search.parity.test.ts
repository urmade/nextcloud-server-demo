import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatParityMismatches, runParityCase } from '../harness';
import { resetParityProvisioningStores, setParityDefaultPhoneRegion } from '../helpers/provisioning-self-read';
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

function postPhoneSearch(body: Record<string, unknown>, headers: Record<string, string>) {
	return {
		method: 'POST' as const,
		headers: {
			...headers,
			'content-type': 'application/json',
		},
		body: JSON.stringify(body),
	};
}

describe('parity: provisioning phone search', () => {
	beforeEach(async () => {
		await resetParityProvisioningStores();
		await setParityDefaultPhoneRegion(null);
	});

	afterEach(async () => {
		await resetParityProvisioningStores();
		await setParityDefaultPhoneRegion(null);
	});

	it('POST /ocs/v2.php/cloud/users/search/by-phone unauthenticated returns 401/997 (provisioning_api-users-search-by-phone-numbers)', async () => {
		const result = await runParityCase({
			name: 'provisioning-phone-search-unauth',
			path: '/ocs/v2.php/cloud/users/search/by-phone?format=json',
			options: postPhoneSearch({ location: 'DE', search: { key1: ['0711 / 25 24 28-90'] } }, OCS_JSON_HEADERS),
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/cloud/users/search/by-phone invalid region ZZ returns HTTP 400 empty data (provisioning_api-users-search-by-phone-numbers)', async () => {
		const result = await runParityCase({
			name: 'provisioning-phone-search-invalid-region',
			path: '/ocs/v2.php/cloud/users/search/by-phone?format=json',
			options: postPhoneSearch({ location: 'ZZ', search: { key1: ['0711 / 25 24 28-90'] } }, aliceHeaders()),
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

	it('POST /ocs/v2.php/cloud/users/search/by-phone empty search returns 200 [] (provisioning_api-users-search-by-phone-numbers)', async () => {
		const result = await runParityCase({
			name: 'provisioning-phone-search-empty',
			path: '/ocs/v2.php/cloud/users/search/by-phone?format=json',
			options: postPhoneSearch({ location: 'DE', search: {} }, aliceHeaders()),
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

	it('POST /ocs/v2.php/cloud/users/search/by-phone happy match returns request key to uid@host (provisioning_api-users-search-by-phone-numbers)', async () => {
		const result = await runParityCase({
			name: 'provisioning-phone-search-happy',
			path: '/ocs/v2.php/cloud/users/search/by-phone?format=json',
			options: postPhoneSearch({
				location: 'DE',
				search: { key1: ['0711 / 25 24 28-90'] },
			}, aliceHeaders()),
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.key1',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/cloud/users/search/by-phone leading zero uses default_phone_region when location differs (provisioning_api-users-search-by-phone-numbers)', async () => {
		await setParityDefaultPhoneRegion('DE');

		const result = await runParityCase({
			name: 'provisioning-phone-search-default-region',
			path: '/ocs/v2.php/cloud/users/search/by-phone?format=json',
			options: postPhoneSearch({
				location: 'FR',
				search: { key2: ['0711 / 25 24 28-90'] },
			}, aliceHeaders()),
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.key2',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});
