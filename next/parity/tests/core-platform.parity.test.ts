import { beforeEach, describe, expect, it } from 'vitest';
import { getParityEnv } from '../env';
import { resetParityAuthStores } from '../helpers/auth';
import { formatParityMismatches, runParityCase } from '../harness';
import {
	basicAuthHeader,
	loginParitySession,
	OCS_JSON_HEADERS,
	OCS_META_PATHS,
} from '../helpers/session';
import { cookieJarToHeader } from '../helpers/cookies';
import { SECURITY_TXT_BODY } from '@/src/server/well-known/handlers';

function normalizeLocation(location: string | null | undefined): string | null {
	if (!location) {
		return null;
	}

	try {
		const url = new URL(location);

		return `${url.pathname}${url.search}`;
	} catch {
		return location;
	}
}

describe('parity: core platform probes', () => {
	beforeEach(async () => {
		await resetParityAuthStores();
	});

	it('GET /.well-known/change-password redirects to security settings', async () => {
		const result = await runParityCase({
			name: 'well-known-change-password',
			path: '/.well-known/change-password',
			compare: {
				contractHeaders: ['location', 'x-nextcloud-well-known'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/.well-known/change-password`, { redirect: 'manual' });

		expect(response.status).toBe(303);
		expect(normalizeLocation(response.headers.get('location'))).toBe('/index.php/settings/user/security');
	});

	it('GET /.well-known/security.txt returns RFC 9116 body', async () => {
		const result = await runParityCase({
			name: 'well-known-security-txt',
			path: '/.well-known/security.txt',
			compare: {
				contractHeaders: ['content-type', 'x-nextcloud-well-known'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/.well-known/security.txt`);
		const body = await response.text();

		expect(response.status).toBe(200);
		expect(body).toBe(SECURITY_TXT_BODY);
	});

	it('GET /.well-known/unknown-service returns 404 JSON (validation)', async () => {
		const result = await runParityCase({
			name: 'well-known-unsupported',
			path: '/.well-known/unknown-service',
			compare: {
				contractHeaders: ['x-nextcloud-well-known'],
				includeBodyPaths: ['message'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
		expect(result.mismatches.find((mismatch) => mismatch.path === 'status')).toBeUndefined();
	});

	it('GET /ocs-provider/ returns service catalog', async () => {
		const result = await runParityCase({
			name: 'ocs-provider-happy',
			path: '/ocs-provider/',
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: ['version', 'services.PRIVATE_DATA', 'services.SHARING'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/core/navigation/apps requires auth (401)', async () => {
		const result = await runParityCase({
			name: 'navigation-apps-unauth',
			path: '/ocs/v2.php/core/navigation/apps?format=json',
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

	it('GET /ocs/v2.php/core/navigation/apps happy path with session', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'navigation-apps-happy',
			path: '/ocs/v2.php/core/navigation/apps?format=json',
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type', 'etag'],
				includeBodyPaths: [...OCS_META_PATHS, 'ocs.data'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/core/navigation/apps returns 304 when ETag matches', async () => {
		const env = getParityEnv();
		const jar = await loginParitySession();
		const cookie = cookieJarToHeader(jar) ?? '';

		const first = await fetch(`${env.newBaseUrl}/ocs/v2.php/core/navigation/apps?format=json`, {
			headers: {
				...OCS_JSON_HEADERS,
				cookie,
			},
		});
		const etag = first.headers.get('etag');
		expect(etag).toBeTruthy();

		const result = await runParityCase({
			name: 'navigation-apps-304',
			path: '/ocs/v2.php/core/navigation/apps?format=json',
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie,
					'if-none-match': etag ?? '',
				},
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
		expect(result.mismatches.find((mismatch) => mismatch.path === 'status')).toBeUndefined();
	});

	it('GET /ocs/v2.php/core/navigation/settings happy path with Basic auth', async () => {
		const result = await runParityCase({
			name: 'navigation-settings-happy',
			path: '/ocs/v2.php/core/navigation/settings?format=json',
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					...basicAuthHeader('admin', 'parity-test-password'),
				},
			},
			compare: {
				contractHeaders: ['content-type', 'etag'],
				includeBodyPaths: [...OCS_META_PATHS, 'ocs.data'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/core/autocomplete/get happy path', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'autocomplete-happy',
			path: '/ocs/v2.php/core/autocomplete/get?format=json&search=ali',
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [...OCS_META_PATHS, 'ocs.data'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/core/autocomplete/get rejects limit=0 (validation)', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'autocomplete-limit-invalid',
			path: '/ocs/v2.php/core/autocomplete/get?format=json&search=ali&limit=0',
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

	it('GET /ocs/v2.php/core/autocomplete/get requires auth (401)', async () => {
		const result = await runParityCase({
			name: 'autocomplete-unauth',
			path: '/ocs/v2.php/core/autocomplete/get?format=json&search=ali',
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

	it('GET /ocs/v2.php/hovercard/v1/admin happy path', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'hovercard-happy',
			path: '/ocs/v2.php/hovercard/v1/admin?format=json',
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [...OCS_META_PATHS, 'ocs.data.userId', 'ocs.data.displayName', 'ocs.data.actions'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/hovercard/v1/unknown returns 404 (validation)', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'hovercard-not-found',
			path: '/ocs/v2.php/hovercard/v1/unknown-user?format=json',
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

	it('GET /ocs/v2.php/hovercard/v1/admin requires auth (401)', async () => {
		const result = await runParityCase({
			name: 'hovercard-unauth',
			path: '/ocs/v2.php/hovercard/v1/admin?format=json',
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
});
