import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatParityMismatches, runParityCase } from '../harness';
import { getParityAdminCredentials } from '@/src/server/ocs/public-leftovers';
import { OCS_JSON_HEADERS, OCS_META_PATHS } from '../helpers/session';

describe('parity: core public leftovers', () => {
	beforeEach(() => {
		vi.stubEnv('NC_PARITY_METRICS_ALLOWED_CLIENTS', '127.0.0.0/16,::1/128');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('GET /ocs/v2.php/config is public with ssl string false (core.OCS#getConfig)', async () => {
		const result = await runParityCase({
			name: 'ocs-config-public',
			path: '/ocs/v2.php/config?format=json',
			options: {
				headers: OCS_JSON_HEADERS,
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.version',
					'ocs.data.website',
					'ocs.data.host',
					'ocs.data.contact',
					'ocs.data.ssl',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/person/check empty login returns HTTP 400 meta 101 (core.OCS#personCheck.post)', async () => {
		const result = await runParityCase({
			name: 'person-check-empty',
			path: '/ocs/v2.php/person/check?format=json',
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
				},
				body: JSON.stringify({ login: '', password: '' }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/person/check bad password returns HTTP 400 meta 102 (core.OCS#personCheck.post)', async () => {
		const { username } = getParityAdminCredentials();

		const result = await runParityCase({
			name: 'person-check-bad-password',
			path: '/ocs/v2.php/person/check?format=json',
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
				},
				body: JSON.stringify({ login: username, password: 'wrong-password' }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/person/check happy path returns personid (core.OCS#personCheck.post)', async () => {
		const { username, password } = getParityAdminCredentials();

		const result = await runParityCase({
			name: 'person-check-happy',
			path: '/ocs/v2.php/person/check?format=json',
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
				},
				body: JSON.stringify({ login: username, password }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.person.personid',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/identityproof/key/admin returns fixture PEM (core.OCS#getIdentityProof)', async () => {
		const result = await runParityCase({
			name: 'identity-proof-hit',
			path: '/ocs/v2.php/identityproof/key/admin?format=json',
			options: {
				headers: OCS_JSON_HEADERS,
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.public',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/identityproof/key/unknown returns 404 list (core.OCS#getIdentityProof)', async () => {
		const result = await runParityCase({
			name: 'identity-proof-miss',
			path: '/ocs/v2.php/identityproof/key/unknown-user?format=json',
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

	it('GET /metrics outside allowlist returns 403 empty (core.OpenMetrics#export)', async () => {
		const result = await runParityCase({
			name: 'metrics-forbidden',
			path: '/metrics',
			options: {
				headers: {
					'x-parity-remote-addr': '10.0.0.1',
				},
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /metrics allowed returns openmetrics text (core.OpenMetrics#export)', async () => {
		const result = await runParityCase({
			name: 'metrics-allowed',
			path: '/metrics',
			options: {
				headers: {
					'x-parity-remote-addr': '127.0.0.1',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});
