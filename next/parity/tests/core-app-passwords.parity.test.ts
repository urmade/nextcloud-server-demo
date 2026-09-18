import { describe, expect, it } from 'vitest';
import { getParityEnv } from '../env';
import { formatParityMismatches, runParityCase } from '../harness';
import { cookieJarToHeader } from '../helpers/cookies';
import {
	basicAuthHeader,
	loginParitySession,
	OCS_JSON_HEADERS,
	OCS_META_PATHS,
} from '../helpers/session';
import { PARITY_ONE_TIME_TOKEN, ensureParityOneTimeToken } from '@/src/server/ocs/app-password';
import { resetAppPasswordStore, storeAppPasswordToken } from '@/src/server/ocs/app-password-store';

function seedMockAppPasswordToken(userId: string, token: string): void {
	storeAppPasswordToken(userId, userId, token, 'parity-test');
}

async function createAppPassword(jar: Record<string, string>): Promise<string> {
	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/ocs/v2.php/core/getapppassword?format=json`, {
		headers: {
			...OCS_JSON_HEADERS,
			cookie: cookieJarToHeader(jar) ?? '',
			'user-agent': 'parity-test',
		},
	});
	const body = await response.json() as { ocs: { data: { apppassword: string } } };

	return body.ocs.data.apppassword;
}

async function syncAppPasswordSession(jar: Record<string, string>, token: string): Promise<string> {
	const env = getParityEnv();

	const response = await fetch(`${env.newBaseUrl}/ocs/v2.php/core/apppassword/rotate?format=json`, {
		method: 'POST',
		headers: {
			...OCS_JSON_HEADERS,
			cookie: cookieJarToHeader(jar) ?? '',
			...basicAuthHeader('admin', token),
		},
	});
	const body = await response.json() as { ocs: { data: { apppassword: string } } };

	return body.ocs.data.apppassword;
}

describe('parity: core app passwords', () => {
	it('GET /ocs/v2.php/core/getapppassword requires auth (401)', async () => {
		const result = await runParityCase({
			name: 'getapppassword-unauth',
			path: '/ocs/v2.php/core/getapppassword?format=json',
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

	it('GET /ocs/v2.php/core/getapppassword happy path', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'getapppassword-happy',
			path: '/ocs/v2.php/core/getapppassword?format=json',
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
					'user-agent': 'parity-test',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
				unstableIdPaths: ['ocs.data.apppassword'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/core/getapppassword rejects when app password already in use (validation)', async () => {
		const jar = await loginParitySession();
		const token = await createAppPassword(jar);
		const activeToken = await syncAppPasswordSession(jar, token);
		seedMockAppPasswordToken('admin', activeToken);

		const result = await runParityCase({
			name: 'getapppassword-forbidden',
			path: '/ocs/v2.php/core/getapppassword?format=json',
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
					...basicAuthHeader('admin', activeToken),
					'user-agent': 'parity-test',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [...OCS_META_PATHS, 'ocs.meta.message'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('DELETE /ocs/v2.php/core/apppassword requires auth (401)', async () => {
		const result = await runParityCase({
			name: 'delete-apppassword-unauth',
			path: '/ocs/v2.php/core/apppassword?format=json',
			options: {
				method: 'DELETE',
				headers: OCS_JSON_HEADERS,
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('DELETE /ocs/v2.php/core/apppassword rejects without app password session (validation)', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'delete-apppassword-forbidden',
			path: '/ocs/v2.php/core/apppassword?format=json',
			options: {
				method: 'DELETE',
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [...OCS_META_PATHS, 'ocs.meta.message'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('DELETE /ocs/v2.php/core/apppassword happy path', async () => {
		const jar = await loginParitySession();
		const token = await createAppPassword(jar);
		const activeToken = await syncAppPasswordSession(jar, token);
		seedMockAppPasswordToken('admin', activeToken);

		const result = await runParityCase({
			name: 'delete-apppassword-happy',
			path: '/ocs/v2.php/core/apppassword?format=json',
			options: {
				method: 'DELETE',
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
					...basicAuthHeader('admin', activeToken),
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/core/apppassword/rotate requires auth (401)', async () => {
		const result = await runParityCase({
			name: 'rotate-apppassword-unauth',
			path: '/ocs/v2.php/core/apppassword/rotate?format=json',
			options: {
				method: 'POST',
				headers: OCS_JSON_HEADERS,
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/core/apppassword/rotate rejects without app password session (validation)', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'rotate-apppassword-forbidden',
			path: '/ocs/v2.php/core/apppassword/rotate?format=json',
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [...OCS_META_PATHS, 'ocs.meta.message'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/core/apppassword/rotate happy path', async () => {
		const jar = await loginParitySession();
		const token = await createAppPassword(jar);
		const activeToken = await syncAppPasswordSession(jar, token);
		seedMockAppPasswordToken('admin', activeToken);

		const result = await runParityCase({
			name: 'rotate-apppassword-happy',
			path: '/ocs/v2.php/core/apppassword/rotate?format=json',
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
					...basicAuthHeader('admin', activeToken),
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
				unstableIdPaths: ['ocs.data.apppassword'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PUT /ocs/v2.php/core/apppassword/confirm requires auth (401)', async () => {
		const result = await runParityCase({
			name: 'confirm-password-unauth',
			path: '/ocs/v2.php/core/apppassword/confirm?format=json',
			options: {
				method: 'PUT',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
				},
				body: JSON.stringify({ password: 'parity-test-password' }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PUT /ocs/v2.php/core/apppassword/confirm rejects wrong password (validation)', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'confirm-password-forbidden',
			path: '/ocs/v2.php/core/apppassword/confirm?format=json',
			options: {
				method: 'PUT',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({ password: 'wrong-password' }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PUT /ocs/v2.php/core/apppassword/confirm happy path', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'confirm-password-happy',
			path: '/ocs/v2.php/core/apppassword/confirm?format=json',
			options: {
				method: 'PUT',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({ password: 'parity-test-password' }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/core/getapppassword-onetime requires auth (401)', async () => {
		const result = await runParityCase({
			name: 'getapppassword-onetime-unauth',
			path: '/ocs/v2.php/core/getapppassword-onetime?format=json',
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

	it('GET /ocs/v2.php/core/getapppassword-onetime rejects without one-time token (validation)', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'getapppassword-onetime-forbidden',
			path: '/ocs/v2.php/core/getapppassword-onetime?format=json',
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
					'user-agent': 'parity-test',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [...OCS_META_PATHS, 'ocs.meta.message'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/core/getapppassword-onetime happy path', async () => {
		resetAppPasswordStore();
		ensureParityOneTimeToken('admin', 'admin');
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'getapppassword-onetime-happy',
			path: '/ocs/v2.php/core/getapppassword-onetime?format=json',
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
					...basicAuthHeader('admin', PARITY_ONE_TIME_TOKEN),
					'user-agent': 'parity-test',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
				unstableIdPaths: ['ocs.data.apppassword'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});
