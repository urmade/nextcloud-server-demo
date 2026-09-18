import { afterEach, describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from '@/src/server/auth/cookies';
import { resetTwoFactorStore } from '@/src/server/two-factor/store';
import { compareParityResponses, snapshotResponse } from '../compare';
import { formatParityMismatches, runParityCase } from '../harness';
import { fetchLegacyMockSnapshot } from '../legacy-mock/adapter';
import {
	expireTwoFactorPasswordConfirmation,
	getSessionIdFromOptions,
	seedNonAdminSession,
} from '../legacy-mock/two-factor';
import { cookieJarToHeader } from '../helpers/cookies';
import {
	basicAuthHeader,
	loginParitySession,
	OCS_JSON_HEADERS,
	OCS_META_PATHS,
} from '../helpers/session';

const ENABLE_BODY = {
	user: 'alice',
	providers: ['parity-totp'],
};

const DISABLE_BODY = {
	user: 'alice',
	providers: ['parity-totp'],
};

describe('parity: core two-factor API', () => {
	afterEach(() => {
		resetTwoFactorStore();
	});

	it('GET /ocs/v2.php/twofactor/state requires auth (401)', async () => {
		const result = await runParityCase({
			name: 'twofactor-state-unauth',
			path: '/ocs/v2.php/twofactor/state?user=alice&format=json',
			options: {
				headers: OCS_JSON_HEADERS,
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/twofactor/state requires admin (403)', async () => {
		const jar = await loginParitySession();
		const sessionId = jar[SESSION_COOKIE];

		if (sessionId) {
			seedNonAdminSession(sessionId, 'alice');
		}

		const result = await runParityCase({
			name: 'twofactor-state-non-admin',
			path: '/ocs/v2.php/twofactor/state?user=alice&format=json',
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

	it('GET /ocs/v2.php/twofactor/state happy path', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'twofactor-state-happy',
			path: '/ocs/v2.php/twofactor/state?user=alice&format=json',
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

	it('GET /ocs/v2.php/twofactor/state rejects unknown user (validation)', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'twofactor-state-unknown-user',
			path: '/ocs/v2.php/twofactor/state?user=missing-user&format=json',
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

	it('POST /ocs/v2.php/twofactor/enable requires auth (401)', async () => {
		const result = await runParityCase({
			name: 'twofactor-enable-unauth',
			path: '/ocs/v2.php/twofactor/enable?format=json',
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
				},
				body: JSON.stringify(ENABLE_BODY),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/twofactor/enable happy path', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'twofactor-enable-happy',
			path: '/ocs/v2.php/twofactor/enable?format=json',
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify(ENABLE_BODY),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.parity-totp',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/twofactor/enable rejects stale password confirmation (validation)', async () => {
		const jar = await loginParitySession();
		const path = '/ocs/v2.php/twofactor/enable?format=json';
		const options = {
			method: 'POST',
			headers: {
				...OCS_JSON_HEADERS,
				'content-type': 'application/json',
				cookie: cookieJarToHeader(jar) ?? '',
			},
			body: JSON.stringify(ENABLE_BODY),
		};
		const sessionId = getSessionIdFromOptions(options);

		if (sessionId) {
			expireTwoFactorPasswordConfirmation(sessionId);
		}

		const legacySnapshot = await fetchLegacyMockSnapshot(path, options);
		const request = new Request(`http://127.0.0.1:3100${path}`, options);
		const { handleTwoFactorEnable } = await import('@/src/server/two-factor/api');
		const response = await handleTwoFactorEnable(request);
		const newSnapshot = snapshotResponse(response, await response.text());
		const mismatches = compareParityResponses(legacySnapshot, newSnapshot, {
			contractHeaders: ['content-type', 'x-nc-auth-notconfirmed'],
			includeBodyPaths: [
				...OCS_META_PATHS,
				'ocs.data',
			],
		});

		expect(mismatches, formatParityMismatches(mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/twofactor/disable requires auth (401)', async () => {
		const result = await runParityCase({
			name: 'twofactor-disable-unauth',
			path: '/ocs/v2.php/twofactor/disable?format=json',
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
				},
				body: JSON.stringify(DISABLE_BODY),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/twofactor/disable happy path', async () => {
		const jar = await loginParitySession();

		await runParityCase({
			name: 'twofactor-enable-before-disable',
			path: '/ocs/v2.php/twofactor/enable?format=json',
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify(ENABLE_BODY),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		const result = await runParityCase({
			name: 'twofactor-disable-happy',
			path: '/ocs/v2.php/twofactor/disable?format=json',
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
					...basicAuthHeader('admin', 'parity-test-password'),
				},
				body: JSON.stringify(DISABLE_BODY),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.parity-totp',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/twofactor/disable rejects missing strict password header (validation)', async () => {
		const jar = await loginParitySession();
		const path = '/ocs/v2.php/twofactor/disable?format=json';
		const options = {
			method: 'POST',
			headers: {
				...OCS_JSON_HEADERS,
				'content-type': 'application/json',
				cookie: cookieJarToHeader(jar) ?? '',
			},
			body: JSON.stringify(DISABLE_BODY),
		};
		const legacySnapshot = await fetchLegacyMockSnapshot(path, options);
		const request = new Request(`http://127.0.0.1:3100${path}`, options);
		const { handleTwoFactorDisable } = await import('@/src/server/two-factor/api');
		const response = await handleTwoFactorDisable(request);
		const newSnapshot = snapshotResponse(response, await response.text());
		const mismatches = compareParityResponses(legacySnapshot, newSnapshot, {
			contractHeaders: ['content-type'],
			includeBodyPaths: [
				...OCS_META_PATHS,
				'ocs.data',
			],
		});

		expect(mismatches, formatParityMismatches(mismatches)).toEqual([]);
	});
});
