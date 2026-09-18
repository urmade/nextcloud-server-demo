import { afterEach, describe, expect, it } from 'vitest';
import { SESSION_COOKIE, USERNAME_COOKIE } from '@/src/server/auth/cookies';
import {
	FIXTURE_ASSERTION_DATA,
	FIXTURE_CREDENTIAL_ID,
} from '@/src/server/auth/webauthn';
import { resetSessionStore } from '@/src/server/auth/session-store';
import { resetWebAuthnStore } from '@/src/server/auth/webauthn-store';
import { getParityEnv } from '../env';
import { fetchLegacyMockSnapshot } from '../legacy-mock/adapter';
import { formatParityMismatches, runParityCase } from '../harness';
import { cookieJarToHeader, mergeResponseCookies, parseSetCookieHeader } from '../helpers/cookies';
import { loginParitySession, OCS_JSON_HEADERS } from '../helpers/session';
import type { ParityResponseSnapshot } from '../types';

const JSON_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: [
		'timeout',
		'userVerification',
		'allowCredentials[0].type',
		'allowCredentials[0].id',
		'defaultRedirectUrl',
	],
	unstableIdPaths: ['challenge', 'rpId'],
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

async function registerWebAuthnOnServer(baseUrl: string, adminJar: Record<string, string>, user = 'admin'): Promise<void> {
	const response = await fetch(`${baseUrl}/ocs/v2.php/webauthn/parity/register?format=json`, {
		method: 'POST',
		headers: {
			...OCS_JSON_HEADERS,
			cookie: cookieJarToHeader(adminJar) ?? '',
		},
		body: JSON.stringify({ user }),
	});

	expect(response.status).toBe(200);
}

async function registerWebAuthnOnLegacy(adminJar: Record<string, string>, user = 'admin'): Promise<void> {
	const snapshot = await fetchLegacyMockSnapshot('/ocs/v2.php/webauthn/parity/register?format=json', {
		method: 'POST',
		headers: {
			...OCS_JSON_HEADERS,
			cookie: cookieJarToHeader(adminJar) ?? '',
		},
		body: JSON.stringify({ user }),
	});

	expect(snapshot.status).toBe(200);
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

async function startWebAuthnOnServer(baseUrl: string, loginName = 'admin', jar: Record<string, string> = {}): Promise<{
	jar: Record<string, string>;
	body: Record<string, unknown>;
}> {
	const response = await fetch(`${baseUrl}/login/webauthn/start`, {
		method: 'POST',
		redirect: 'manual',
		headers: {
			'content-type': 'application/json',
			cookie: cookieJarToHeader(jar) ?? '',
		},
		body: JSON.stringify({ loginName }),
	});

	const nextJar = mergeResponseCookies(jar, response);
	const body = await response.json() as Record<string, unknown>;

	return { jar: nextJar, body };
}

async function startWebAuthnOnLegacy(loginName = 'admin', jar: Record<string, string> = {}): Promise<{
	jar: Record<string, string>;
	body: Record<string, unknown>;
}> {
	const snapshot = await fetchLegacyMockSnapshot('/login/webauthn/start', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			cookie: cookieJarToHeader(jar) ?? '',
		},
		body: JSON.stringify({ loginName }),
	});

	return {
		jar: mergeSnapshotCookies(jar, snapshot),
		body: snapshot.body as Record<string, unknown>,
	};
}

async function prepareServerWebAuthnFinish(baseUrl: string): Promise<Record<string, string>> {
	const adminJar = await loginParitySession(baseUrl);
	await registerWebAuthnOnServer(baseUrl, adminJar);
	const { jar } = await startWebAuthnOnServer(baseUrl);

	return jar;
}

async function prepareLegacyWebAuthnFinish(): Promise<Record<string, string>> {
	const adminJar = await loginLegacyMockJar();
	await registerWebAuthnOnLegacy(adminJar);
	const { jar } = await startWebAuthnOnLegacy('admin', adminJar);

	return jar;
}

describe('parity: core-login-webauthn', () => {
	afterEach(() => {
		resetSessionStore();
		resetWebAuthnStore();
	});

	it('POST /login/webauthn/start happy path returns request options', async () => {
		const env = getParityEnv();
		const adminJar = await loginParitySession(env.newBaseUrl);
		await registerWebAuthnOnServer(env.newBaseUrl, adminJar);
		const legacyAdminJar = await loginLegacyMockJar();
		await registerWebAuthnOnLegacy(legacyAdminJar);

		const result = await runParityCase({
			name: 'webauthn-start-happy',
			path: '/login/webauthn/start',
			options: {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
				},
				body: JSON.stringify({ loginName: 'admin' }),
			},
			compare: JSON_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const { body } = await startWebAuthnOnServer(env.newBaseUrl);

		expect(body.timeout).toBe(60000);
		expect(body.userVerification).toBe('required');
		expect(body.allowCredentials).toEqual([{
			type: 'public-key',
			id: FIXTURE_CREDENTIAL_ID,
		}]);
		expect(typeof body.challenge).toBe('string');
		expect((body.challenge as string).length).toBeGreaterThan(0);
	});

	it('POST /login/webauthn/start without credentials returns empty allowCredentials', async () => {
		const env = getParityEnv();
		const legacy = await fetchLegacyMockSnapshot('/login/webauthn/start', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
			},
			body: JSON.stringify({ loginName: 'nobody' }),
		});

		const response = await fetch(`${env.newBaseUrl}/login/webauthn/start`, {
			method: 'POST',
			redirect: 'manual',
			headers: {
				'content-type': 'application/json',
			},
			body: JSON.stringify({ loginName: 'nobody' }),
		});
		const body = await response.json() as { allowCredentials: unknown[] };

		expect(legacy.status).toBe(200);
		expect(response.status).toBe(200);
		expect(body.allowCredentials).toEqual([]);
		expect((legacy.body as { allowCredentials: unknown[] }).allowCredentials).toEqual([]);
	});

	it('POST /login/webauthn/finish without session returns 400 empty array', async () => {
		const result = await runParityCase({
			name: 'webauthn-finish-missing-session',
			path: '/login/webauthn/finish',
			options: {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
				},
				body: JSON.stringify({ data: FIXTURE_ASSERTION_DATA }),
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/login/webauthn/finish`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
			},
			body: JSON.stringify({ data: FIXTURE_ASSERTION_DATA }),
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual([]);
	});

	it('POST /login/webauthn/finish with invalid assertion returns 400 empty array', async () => {
		const env = getParityEnv();
		const serverJar = await prepareServerWebAuthnFinish(env.newBaseUrl);
		const legacyJar = await prepareLegacyWebAuthnFinish();

		const legacy = await fetchLegacyMockSnapshot('/login/webauthn/finish', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: cookieJarToHeader(legacyJar) ?? '',
			},
			body: JSON.stringify({ data: '{"id":"invalid"}' }),
		});

		const response = await fetch(`${env.newBaseUrl}/login/webauthn/finish`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: cookieJarToHeader(serverJar) ?? '',
			},
			body: JSON.stringify({ data: '{"id":"invalid"}' }),
		});

		expect(legacy.status).toBe(400);
		expect(response.status).toBe(400);
		expect(legacy.body).toEqual([]);
		expect(await response.json()).toEqual([]);
	});

	it('POST /login/webauthn/finish happy path completes login', async () => {
		const env = getParityEnv();
		const serverJar = await prepareServerWebAuthnFinish(env.newBaseUrl);
		const legacyJar = await prepareLegacyWebAuthnFinish();

		const legacy = await fetchLegacyMockSnapshot('/login/webauthn/finish', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: cookieJarToHeader(legacyJar) ?? '',
			},
			body: JSON.stringify({ data: FIXTURE_ASSERTION_DATA }),
		});

		const response = await fetch(`${env.newBaseUrl}/login/webauthn/finish`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: cookieJarToHeader(serverJar) ?? '',
			},
			body: JSON.stringify({ data: FIXTURE_ASSERTION_DATA }),
		});
		const body = await response.json() as { defaultRedirectUrl: string };

		expect(legacy.status).toBe(200);
		expect(response.status).toBe(200);
		expect((legacy.body as { defaultRedirectUrl: string }).defaultRedirectUrl).toContain('/index.php/apps/dashboard/');
		expect(body.defaultRedirectUrl).toContain('/index.php/apps/dashboard/');

		const mergedJar = mergeResponseCookies(serverJar, response);

		expect(mergedJar[USERNAME_COOKIE]).toBe('admin');
		expect(mergedJar[SESSION_COOKIE]).toBeTruthy();
	});
});
