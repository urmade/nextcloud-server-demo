import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	FIXTURE_PROVIDER_ID,
	FIXTURE_SETUP_PROVIDER_ID,
} from '@/src/server/auth/two-factor-challenge';
import { tryEnableTwoFactorProvider } from '@/src/server/two-factor/store';
import { getParityEnv } from '../env';
import { resetParityAuthStores, setParityTwoFactorEnforced } from '../helpers/auth';
import { fetchLegacyMockSnapshot } from '../legacy-mock/adapter';
import { formatParityMismatches, runParityCase } from '../harness';
import { cookieJarToHeader, mergeResponseCookies } from '../helpers/cookies';
import { loginParitySession, OCS_JSON_HEADERS } from '../helpers/session';

const LOCATION_COMPARE = {
	contractHeaders: ['content-type', 'location'],
	ignoreHeaders: ['location'],
};

function normalizeLocation(location: string | null): string | null {
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

async function enableTwoFactorOnServer(baseUrl: string, adminJar: Record<string, string>): Promise<void> {
	const enableResponse = await fetch(`${baseUrl}/ocs/v2.php/twofactor/enable?format=json`, {
		method: 'POST',
		headers: {
			...OCS_JSON_HEADERS,
			cookie: cookieJarToHeader(adminJar) ?? '',
		},
		body: JSON.stringify({ user: 'admin', providers: [FIXTURE_PROVIDER_ID] }),
	});

	expect(enableResponse.status).toBe(200);
}

async function loginWithMandatorySetup(baseUrl = getParityEnv().newBaseUrl): Promise<Record<string, string>> {
	await setParityTwoFactorEnforced(true);

	let jar: Record<string, string> = {};
	const csrfResponse = await fetch(`${baseUrl}/csrftoken`, {
		redirect: 'manual',
		headers: { cookie: cookieJarToHeader(jar) ?? '' },
	});
	jar = mergeResponseCookies(jar, csrfResponse);
	const csrfBody = await csrfResponse.json() as { token: string };

	const loginResponse = await fetch(`${baseUrl}/login`, {
		method: 'POST',
		redirect: 'manual',
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
	jar = mergeResponseCookies(jar, loginResponse);

	expect(loginResponse.status).toBe(303);
	expect(normalizeLocation(loginResponse.headers.get('location'))).toBe('/login/setupchallenge');

	return jar;
}

async function loginWithTwoFactorEnabled(baseUrl = getParityEnv().newBaseUrl): Promise<Record<string, string>> {
	tryEnableTwoFactorProvider(FIXTURE_PROVIDER_ID, 'admin');
	const adminJar = await loginParitySession(baseUrl);
	await enableTwoFactorOnServer(baseUrl, adminJar);

	let jar: Record<string, string> = {};
	const csrfResponse = await fetch(`${baseUrl}/csrftoken`, {
		redirect: 'manual',
		headers: { cookie: cookieJarToHeader(jar) ?? '' },
	});
	jar = mergeResponseCookies(jar, csrfResponse);
	const csrfBody = await csrfResponse.json() as { token: string };

	const loginResponse = await fetch(`${baseUrl}/login`, {
		method: 'POST',
		redirect: 'manual',
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
	jar = mergeResponseCookies(jar, loginResponse);

	expect(loginResponse.status).toBe(303);

	return jar;
}

describe('parity: core-login-2fa-setup', () => {
	beforeEach(async () => {
		await resetParityAuthStores();
	});

	afterEach(async () => {
		await resetParityAuthStores();
	});

	it('GET /login/setupchallenge unauthenticated redirects to login', async () => {
		const result = await runParityCase({
			name: 'twofactor-setup-unauth',
			path: '/login/setupchallenge',
			compare: LOCATION_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/login/setupchallenge`, { redirect: 'manual' });

		expect(response.status).toBe(303);
		expect(normalizeLocation(response.headers.get('location'))).toBe('/login');
	});

	it('GET /login/setupchallenge happy path after mandatory login', async () => {
		const jar = await loginWithMandatorySetup();

		const result = await runParityCase({
			name: 'twofactor-setup-select-happy',
			path: '/login/setupchallenge',
			options: {
				headers: { cookie: cookieJarToHeader(jar) ?? '' },
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/login/setupchallenge`, {
			redirect: 'manual',
			headers: { cookie: cookieJarToHeader(jar) ?? '' },
		});
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(html).toContain('id="twofactor-setup-select"');
		expect(html).toContain(FIXTURE_SETUP_PROVIDER_ID);
	});

	it('GET /login/setupchallenge with primary providers redirects to selectchallenge', async () => {
		const jar = await loginWithTwoFactorEnabled();

		const legacy = await fetchLegacyMockSnapshot('/login/setupchallenge', {
			headers: { cookie: cookieJarToHeader(jar) ?? '' },
		});

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/login/setupchallenge`, {
			redirect: 'manual',
			headers: { cookie: cookieJarToHeader(jar) ?? '' },
		});

		expect(legacy.status).toBe(303);
		expect(response.status).toBe(303);
		expect(normalizeLocation(legacy.headers.location ?? null)).toBe('/login/selectchallenge');
		expect(normalizeLocation(response.headers.get('location'))).toBe('/login/selectchallenge');
	});

	it('GET /login/setupchallenge after 2FA complete redirects to default page', async () => {
		const jar = await loginWithTwoFactorEnabled();
		const solveBody = new URLSearchParams({ challenge: process.env.NC_PARITY_TWO_FACTOR_CODE?.trim() || '123456' }).toString();
		const solveHeaders = {
			'content-type': 'application/x-www-form-urlencoded',
			cookie: cookieJarToHeader(jar) ?? '',
		};

		await fetchLegacyMockSnapshot(`/login/challenge/${FIXTURE_PROVIDER_ID}`, {
			method: 'POST',
			headers: solveHeaders,
			body: solveBody,
		});

		await fetch(`${getParityEnv().newBaseUrl}/login/challenge/${FIXTURE_PROVIDER_ID}`, {
			method: 'POST',
			redirect: 'manual',
			headers: solveHeaders,
			body: solveBody,
		});

		const legacy = await fetchLegacyMockSnapshot('/login/setupchallenge', {
			headers: { cookie: cookieJarToHeader(jar) ?? '' },
		});

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/login/setupchallenge`, {
			redirect: 'manual',
			headers: { cookie: cookieJarToHeader(jar) ?? '' },
		});

		expect(legacy.status).toBe(303);
		expect(response.status).toBe(303);
		expect(normalizeLocation(legacy.headers.location ?? null)).toBe('/index.php/apps/dashboard/');
		expect(normalizeLocation(response.headers.get('location'))).toBe('/index.php/apps/dashboard/');
	});

	it('GET /login/setupchallenge/{id} happy path shows setup challenge', async () => {
		const jar = await loginWithMandatorySetup();

		const result = await runParityCase({
			name: 'twofactor-setup-challenge-happy',
			path: `/login/setupchallenge/${FIXTURE_SETUP_PROVIDER_ID}`,
			options: {
				headers: { cookie: cookieJarToHeader(jar) ?? '' },
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/login/setupchallenge/${FIXTURE_SETUP_PROVIDER_ID}`, {
			redirect: 'manual',
			headers: { cookie: cookieJarToHeader(jar) ?? '' },
		});
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(html).toContain('id="twofactor-setup-challenge"');
	});

	it('GET /login/setupchallenge/{id} unknown provider redirects to selectchallenge', async () => {
		const jar = await loginWithMandatorySetup();

		const legacy = await fetchLegacyMockSnapshot('/login/setupchallenge/unknown-provider', {
			headers: { cookie: cookieJarToHeader(jar) ?? '' },
		});

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/login/setupchallenge/unknown-provider`, {
			redirect: 'manual',
			headers: { cookie: cookieJarToHeader(jar) ?? '' },
		});

		expect(legacy.status).toBe(303);
		expect(response.status).toBe(303);
		expect(normalizeLocation(legacy.headers.location ?? null)).toBe('/login/selectchallenge');
		expect(normalizeLocation(response.headers.get('location'))).toBe('/login/selectchallenge');
	});

	it('POST /login/setupchallenge/{id} always redirects to showChallenge', async () => {
		const jar = await loginWithMandatorySetup();

		for (const providerId of [FIXTURE_SETUP_PROVIDER_ID, 'invalid-provider']) {
			const legacy = await fetchLegacyMockSnapshot(`/login/setupchallenge/${providerId}`, {
				method: 'POST',
				headers: { cookie: cookieJarToHeader(jar) ?? '' },
			});

			const env = getParityEnv();
			const response = await fetch(`${env.newBaseUrl}/login/setupchallenge/${providerId}`, {
				method: 'POST',
				redirect: 'manual',
				headers: { cookie: cookieJarToHeader(jar) ?? '' },
			});

			expect(legacy.status).toBe(303);
			expect(response.status).toBe(303);
			expect(normalizeLocation(legacy.headers.location ?? null)).toBe(`/login/challenge/${providerId}`);
			expect(normalizeLocation(response.headers.get('location'))).toBe(`/login/challenge/${providerId}`);
		}
	});
});
