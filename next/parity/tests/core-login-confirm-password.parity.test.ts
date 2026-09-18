import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getParityEnv } from '../env';
import { resetParityAuthStores } from '../helpers/auth';
import { fetchLegacyMockSnapshot } from '../legacy-mock/adapter';
import { formatParityMismatches, runParityCase } from '../harness';
import { cookieJarToHeader, parseSetCookieHeader } from '../helpers/cookies';
import { loginParitySession } from '../helpers/session';
import type { ParityResponseSnapshot } from '../types';

const JSON_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: ['lastLogin', 'message'],
};

function mergeSnapshotCookies(jar: Record<string, string>, snapshot: ParityResponseSnapshot): Record<string, string> {
	const merged = { ...jar };
	const setCookie = snapshot.headers['set-cookie'];

	if (!setCookie) {
		return merged;
	}

	const parsed = parseSetCookieHeader(setCookie);

	for (const [name, value] of Object.entries(parsed)) {
		if (value) {
			merged[name] = value;
		} else {
			delete merged[name];
		}
	}

	return merged;
}

async function loginLegacyMockJar(): Promise<Record<string, string>> {
	let jar: Record<string, string> = {};
	const csrfSnapshot = await fetchLegacyMockSnapshot('/csrftoken', {
		headers: { cookie: cookieJarToHeader(jar) ?? '' },
	});
	jar = mergeSnapshotCookies(jar, csrfSnapshot);
	const csrfBody = csrfSnapshot.body as { token: string };

	const loginSnapshot = await fetchLegacyMockSnapshot('/login', {
		method: 'POST',
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
			cookie: cookieJarToHeader(jar) ?? '',
		},
		body: new URLSearchParams({
			user: 'admin',
			password: 'parity-test-password',
			requesttoken: csrfBody.token,
		}).toString(),
	});

	return mergeSnapshotCookies(jar, loginSnapshot);
}

describe('parity: core-login-confirm-password', () => {
	beforeEach(async () => {
		await resetParityAuthStores();
	});

	afterEach(async () => {
		await resetParityAuthStores();
	});

	it('POST /login/confirm happy path returns confirm timestamp', async () => {
		const jar = await loginParitySession();
		const legacyJar = await loginLegacyMockJar();
		const requestOptions = {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
			},
			body: JSON.stringify({ password: 'parity-test-password' }),
		};

		const legacy = await fetchLegacyMockSnapshot('/login/confirm', {
			...requestOptions,
			headers: {
				...requestOptions.headers,
				cookie: cookieJarToHeader(legacyJar) ?? '',
			},
		});

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/login/confirm`, {
			...requestOptions,
			headers: {
				...requestOptions.headers,
				cookie: cookieJarToHeader(jar) ?? '',
			},
		});
		const body = await response.json() as { lastLogin: number };

		expect(legacy.status).toBe(200);
		expect(response.status).toBe(200);
		expect(typeof (legacy.body as { lastLogin: number }).lastLogin).toBe('number');
		expect(typeof body.lastLogin).toBe('number');
		expect(body.lastLogin).toBeGreaterThan(1_600_000_000);
	});

	it('POST /index.php/login/confirm matches pretty twin', async () => {
		const jar = await loginParitySession();
		const legacyJar = await loginLegacyMockJar();
		const requestOptions = {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
			},
			body: JSON.stringify({ password: 'parity-test-password' }),
		};

		const legacy = await fetchLegacyMockSnapshot('/index.php/login/confirm', {
			...requestOptions,
			headers: {
				...requestOptions.headers,
				cookie: cookieJarToHeader(legacyJar) ?? '',
			},
		});

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/index.php/login/confirm`, {
			...requestOptions,
			headers: {
				...requestOptions.headers,
				cookie: cookieJarToHeader(jar) ?? '',
			},
		});
		const body = await response.json() as { lastLogin: number };

		expect(legacy.status).toBe(200);
		expect(response.status).toBe(200);
		expect(typeof (legacy.body as { lastLogin: number }).lastLogin).toBe('number');
		expect(typeof body.lastLogin).toBe('number');
	});

	it('POST /login/confirm requires auth (401 JSON)', async () => {
		const result = await runParityCase({
			name: 'confirm-password-unauth',
			path: '/login/confirm',
			options: {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					accept: 'application/json',
				},
				body: JSON.stringify({ password: 'parity-test-password' }),
			},
			compare: JSON_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/login/confirm`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				accept: 'application/json',
			},
			body: JSON.stringify({ password: 'parity-test-password' }),
		});

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ message: 'Current user is not logged in' });
	});

	it('POST /login/confirm unauthenticated HTML redirects to login', async () => {
		const env = getParityEnv();
		const legacy = await fetchLegacyMockSnapshot('/login/confirm', {
			method: 'POST',
			headers: {
				accept: 'text/html',
				'content-type': 'application/json',
			},
			body: JSON.stringify({ password: 'parity-test-password' }),
		});

		const response = await fetch(`${env.newBaseUrl}/login/confirm`, {
			method: 'POST',
			redirect: 'manual',
			headers: {
				accept: 'text/html',
				'content-type': 'application/json',
			},
			body: JSON.stringify({ password: 'parity-test-password' }),
		});

		expect(legacy.status).toBe(303);
		expect(response.status).toBe(303);
		expect(legacy.headers.location).toContain('/login');
		expect(response.headers.get('location')).toContain('/login');
	});

	it('POST /login/confirm rejects wrong password (403)', async () => {
		const jar = await loginParitySession();
		const legacyJar = await loginLegacyMockJar();

		const legacy = await fetchLegacyMockSnapshot('/login/confirm', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: cookieJarToHeader(legacyJar) ?? '',
			},
			body: JSON.stringify({ password: 'wrong-password' }),
		});

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/login/confirm`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: cookieJarToHeader(jar) ?? '',
			},
			body: JSON.stringify({ password: 'wrong-password' }),
		});

		expect(legacy.status).toBe(403);
		expect(response.status).toBe(403);
		expect(legacy.body).toEqual([]);
		expect(await response.json()).toEqual([]);
	});

	it('POST /login/confirm missing password returns 400 empty', async () => {
		const jar = await loginParitySession();
		const legacyJar = await loginLegacyMockJar();

		const legacy = await fetchLegacyMockSnapshot('/login/confirm', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: cookieJarToHeader(legacyJar) ?? '',
			},
			body: JSON.stringify({}),
		});

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/login/confirm`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: cookieJarToHeader(jar) ?? '',
			},
			body: JSON.stringify({}),
		});

		expect(legacy.status).toBe(400);
		expect(response.status).toBe(400);
		expect(legacy.rawBody).toBe('');
		expect(await response.text()).toBe('');
	});
});
