import { describe, expect, it } from 'vitest';
import { formatParityMismatches, runParityCase } from '../harness';

const OCS_JSON_HEADERS = {
	'OCS-APIRequest': 'true',
	Accept: 'application/json',
};

const CAPABILITIES_CORE_PATHS = [
	'ocs.meta.status',
	'ocs.meta.statuscode',
	'ocs.meta.message',
	'ocs.data.version',
	'ocs.data.capabilities.core',
];

function basicAuthHeader(username: string, password: string): Record<string, string> {
	const encoded = Buffer.from(`${username}:${password}`).toString('base64');

	return {
		Authorization: `Basic ${encoded}`,
	};
}

describe('parity: core-status', () => {
	it('GET /status.php happy path', async () => {
		const result = await runParityCase({
			name: 'status-happy',
			path: '/status.php',
			compare: {
				contractHeaders: ['content-type', 'access-control-allow-origin'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /status.php ignores invalid Authorization', async () => {
		const result = await runParityCase({
			name: 'status-bogus-auth',
			path: '/status.php',
			options: {
				headers: {
					Authorization: 'Basic not-valid-base64',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /status.php rejects POST with 405', async () => {
		const env = await import('../env');
		const parityEnv = env.getParityEnv();
		const response = await fetch(`${parityEnv.newBaseUrl}/status.php`, { method: 'POST' });

		expect(response.status).toBe(405);
	});

	it('GET /ocs/v2.php/cloud/capabilities public happy path', async () => {
		const result = await runParityCase({
			name: 'capabilities-v2-public',
			path: '/ocs/v2.php/cloud/capabilities?format=json',
			options: {
				headers: OCS_JSON_HEADERS,
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: CAPABILITIES_CORE_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v1.php/cloud/capabilities public happy path', async () => {
		const result = await runParityCase({
			name: 'capabilities-v1-public',
			path: '/ocs/v1.php/cloud/capabilities?format=json',
			options: {
				headers: OCS_JSON_HEADERS,
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: CAPABILITIES_CORE_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/cloud/capabilities authenticated core subset', async () => {
		const result = await runParityCase({
			name: 'capabilities-v2-authenticated',
			path: '/ocs/v2.php/cloud/capabilities?format=json',
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					...basicAuthHeader('admin', 'parity-test-password'),
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...CAPABILITIES_CORE_PATHS,
					'ocs.data.capabilities.core.user',
					'ocs.data.capabilities.core.can-create-app-token',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/cloud/capabilities invalid auth still returns public core', async () => {
		const result = await runParityCase({
			name: 'capabilities-v2-invalid-auth',
			path: '/ocs/v2.php/cloud/capabilities?format=json',
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					...basicAuthHeader('nobody', 'wrong-password'),
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: CAPABILITIES_CORE_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PUT /ocs/v2.php/cloud/capabilities returns method not allowed', async () => {
		const result = await runParityCase({
			name: 'capabilities-v2-put',
			path: '/ocs/v2.php/cloud/capabilities?format=json',
			options: {
				method: 'PUT',
				headers: OCS_JSON_HEADERS,
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: ['ocs.meta.status', 'ocs.meta.statuscode', 'ocs.meta.message'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PUT /ocs/v1.php/cloud/capabilities returns OCS failure with HTTP 200', async () => {
		const result = await runParityCase({
			name: 'capabilities-v1-put',
			path: '/ocs/v1.php/cloud/capabilities?format=json',
			options: {
				method: 'PUT',
				headers: OCS_JSON_HEADERS,
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: ['ocs.meta.status', 'ocs.meta.statuscode', 'ocs.meta.message'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
		expect(result.mismatches.find((mismatch) => mismatch.path === 'status')).toBeUndefined();
	});
});
