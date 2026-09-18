import { describe, expect, it } from 'vitest';
import { getParityEnv } from '../env';
import { fetchLegacyMockSnapshot } from '../legacy-mock/adapter';
import { formatParityMismatches, runParityCase } from '../harness';
import { cookieJarToHeader, mergeResponseCookies } from '../helpers/cookies';

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

async function fetchWithJar(
	baseUrl: string,
	path: string,
	jar: Record<string, string>,
	options: { method?: string; body?: string; headers?: Record<string, string> } = {},
) {
	const headers = { ...options.headers };

	const cookieHeader = cookieJarToHeader(jar);

	if (cookieHeader) {
		headers.cookie = cookieHeader;
	}

	const response = await fetch(`${baseUrl}${path}`, {
		method: options.method ?? 'GET',
		headers,
		body: options.body,
		redirect: 'manual',
	});

	const updatedJar = mergeResponseCookies(jar, response);
	const rawBody = await response.text();

	return { response, rawBody, jar: updatedJar };
}

describe('parity: core-auth', () => {
	it('GET /csrftoken happy path returns token shape', async () => {
		const result = await runParityCase({
			name: 'csrftoken-happy',
			path: '/csrftoken',
			compare: {
				contractHeaders: ['content-type'],
				unstableIdPaths: ['token'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/csrftoken`, { redirect: 'manual' });
		const body = await response.json() as { token: string };

		expect(body.token).toContain(':');
	});

	it('GET /csrftoken returns 403 when session cookie lacks strict same-site cookies', async () => {
		const env = getParityEnv();

		const bootstrap = await fetch(`${env.newBaseUrl}/csrftoken`, { redirect: 'manual' });
		const setCookie = bootstrap.headers.get('set-cookie') ?? '';
		const sessionMatch = /nc_session_id=([^;]+)/.exec(setCookie);
		expect(sessionMatch).toBeTruthy();

		const result = await runParityCase({
			name: 'csrftoken-strict-fail',
			path: '/csrftoken',
			options: {
				headers: {
					cookie: `nc_session_id=${sessionMatch?.[1]}`,
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				ignoreHeaders: ['cache-control'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const legacy = fetchLegacyMockSnapshot('/csrftoken', {
			headers: { cookie: `nc_session_id=${sessionMatch?.[1]}` },
		});

		expect(legacy.status).toBe(403);
		expect(legacy.body).toEqual([]);
	});

	it('GET /login returns HTML login page', async () => {
		const result = await runParityCase({
			name: 'login-get-happy',
			path: '/login',
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/login`, { redirect: 'manual' });
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(html).toContain('id="login"');
	});

	it('POST /login wrong password redirects to login form', async () => {
		const env = getParityEnv();
		const csrfResponse = await fetch(`${env.newBaseUrl}/csrftoken`, { redirect: 'manual' });
		const csrfBody = await csrfResponse.json() as { token: string };
		const cookies = mergeResponseCookies({}, csrfResponse);
		const body = new URLSearchParams({
			user: 'admin',
			password: 'wrong-password',
			requesttoken: csrfBody.token,
		}).toString();

		const legacy = fetchLegacyMockSnapshot('/login', {
			method: 'POST',
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				cookie: cookieJarToHeader(cookies) ?? '',
			},
			body,
		});

		const newResponse = await fetch(`${env.newBaseUrl}/login`, {
			method: 'POST',
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				cookie: cookieJarToHeader(cookies) ?? '',
			},
			body,
			redirect: 'manual',
		});

		expect(legacy.status).toBe(303);
		expect(newResponse.status).toBe(303);
		expect(normalizeLocation(legacy.headers.location ?? null)).toBe('/login?user=admin&direct=1');
		expect(normalizeLocation(newResponse.headers.get('location'))).toBe('/login?user=admin&direct=1');
	});

	it('POST /login missing CSRF redirects to login form', async () => {
		const env = getParityEnv();
		const csrfResponse = await fetch(`${env.newBaseUrl}/csrftoken`, { redirect: 'manual' });
		const cookies = mergeResponseCookies({}, csrfResponse);

		const legacy = fetchLegacyMockSnapshot('/login', {
			method: 'POST',
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				cookie: cookieJarToHeader(cookies) ?? '',
			},
			body: new URLSearchParams({ user: 'admin', password: 'secret' }).toString(),
		});

		const newResponse = await fetch(`${env.newBaseUrl}/login`, {
			method: 'POST',
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				cookie: cookieJarToHeader(cookies) ?? '',
			},
			body: new URLSearchParams({ user: 'admin', password: 'secret' }).toString(),
			redirect: 'manual',
		});

		expect(legacy.status).toBe(303);
		expect(newResponse.status).toBe(303);
		expect(normalizeLocation(legacy.headers.location ?? null)).toBe('/login?user=admin&direct=1');
		expect(normalizeLocation(newResponse.headers.get('location'))).toBe('/login?user=admin&direct=1');
	});

	it('POST /login with long username redirects (validation)', async () => {
		const env = getParityEnv();
		const csrfResponse = await fetch(`${env.newBaseUrl}/csrftoken`, { redirect: 'manual' });
		const csrfBody = await csrfResponse.json() as { token: string };
		const cookies = mergeResponseCookies({}, csrfResponse);
		const longUser = 'a'.repeat(256);

		const legacy = fetchLegacyMockSnapshot('/login', {
			method: 'POST',
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				cookie: cookieJarToHeader(cookies) ?? '',
			},
			body: new URLSearchParams({
				user: longUser,
				password: 'parity-test-password',
				requesttoken: csrfBody.token,
			}).toString(),
		});

		const newResponse = await fetch(`${env.newBaseUrl}/login`, {
			method: 'POST',
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				cookie: cookieJarToHeader(cookies) ?? '',
			},
			body: new URLSearchParams({
				user: longUser,
				password: 'parity-test-password',
				requesttoken: csrfBody.token,
			}).toString(),
			redirect: 'manual',
		});

		expect(legacy.status).toBe(303);
		expect(newResponse.status).toBe(303);
		expect(normalizeLocation(newResponse.headers.get('location'))?.startsWith('/login?user=')).toBe(true);
	});

	it('POST /login happy path sets session cookies and redirects', async () => {
		const env = getParityEnv();
		let jar: Record<string, string> = {};

		const csrfFetch = await fetchWithJar(env.newBaseUrl, '/csrftoken', jar);
		jar = csrfFetch.jar;
		const csrfBody = JSON.parse(csrfFetch.rawBody) as { token: string };

		const loginFetch = await fetchWithJar(env.newBaseUrl, '/login', jar, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				user: 'admin',
				password: 'parity-test-password',
				requesttoken: csrfBody.token,
			}).toString(),
		});

		expect(loginFetch.response.status).toBe(303);
		expect(normalizeLocation(loginFetch.response.headers.get('location'))).toBe('/index.php/apps/dashboard/');
		expect(loginFetch.jar.nc_username).toBe('admin');
		expect(loginFetch.jar.nc_token).toBeTruthy();
		expect(loginFetch.jar.nc_session_id).toBeTruthy();

		const legacyCsrf = fetchLegacyMockSnapshot('/csrftoken', { headers: { cookie: cookieJarToHeader(jar) ?? '' } });
		const legacyLogin = fetchLegacyMockSnapshot('/login', {
			method: 'POST',
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				cookie: cookieJarToHeader(jar) ?? '',
			},
			body: new URLSearchParams({
				user: 'admin',
				password: 'parity-test-password',
				requesttoken: (legacyCsrf.body as { token: string }).token,
			}).toString(),
		});

		expect(legacyLogin.status).toBe(303);
	});

	it('GET /logout clears session and redirects to login', async () => {
		const env = getParityEnv();
		let jar: Record<string, string> = {};

		const csrfFetch = await fetchWithJar(env.newBaseUrl, '/csrftoken', jar);
		jar = csrfFetch.jar;
		const csrfBody = JSON.parse(csrfFetch.rawBody) as { token: string };

		const loginFetch = await fetchWithJar(env.newBaseUrl, '/login', jar, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				user: 'admin',
				password: 'parity-test-password',
				requesttoken: csrfBody.token,
			}).toString(),
		});
		jar = loginFetch.jar;

		const logoutFetch = await fetchWithJar(env.newBaseUrl, '/logout', jar);
		const legacyLogout = fetchLegacyMockSnapshot('/logout', {
			headers: { cookie: cookieJarToHeader(jar) ?? '' },
		});

		expect(logoutFetch.response.status).toBe(303);
		expect(normalizeLocation(logoutFetch.response.headers.get('location'))).toBe('/login?clear=true');
		expect(logoutFetch.response.headers.get('x-user-id')).toBe('admin');
		expect(legacyLogout.status).toBe(303);
		expect(normalizeLocation(legacyLogout.headers.location ?? null)).toBe('/login?clear=true');
	});

	it('GET /login redirects when already authenticated', async () => {
		const env = getParityEnv();
		let jar: Record<string, string> = {};
		let legacyJar: Record<string, string> = {};

		const csrfFetch = await fetchWithJar(env.newBaseUrl, '/csrftoken', jar);
		jar = csrfFetch.jar;
		const csrfBody = JSON.parse(csrfFetch.rawBody) as { token: string };

		const legacyCsrf = fetchLegacyMockSnapshot('/csrftoken', {
			headers: { cookie: cookieJarToHeader(legacyJar) ?? '' },
		});
		legacyJar = mergeResponseCookies(legacyJar, new Response(null, {
			headers: legacyCsrf.headers['set-cookie'] ? { 'set-cookie': legacyCsrf.headers['set-cookie'] } : {},
		}));

		const loginFetch = await fetchWithJar(env.newBaseUrl, '/login', jar, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				user: 'admin',
				password: 'parity-test-password',
				requesttoken: csrfBody.token,
			}).toString(),
		});
		jar = loginFetch.jar;
		expect(loginFetch.response.status).toBe(303);

		const legacyLogin = fetchLegacyMockSnapshot('/login', {
			method: 'POST',
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				cookie: cookieJarToHeader(legacyJar) ?? '',
			},
			body: new URLSearchParams({
				user: 'admin',
				password: 'parity-test-password',
				requesttoken: (legacyCsrf.body as { token: string }).token,
			}).toString(),
		});
		legacyJar = mergeResponseCookies(legacyJar, new Response(null, {
			headers: legacyLogin.headers['set-cookie'] ? { 'set-cookie': legacyLogin.headers['set-cookie'] } : {},
		}));

		const loginGet = await fetchWithJar(env.newBaseUrl, '/login', jar);
		const legacyLoginGet = fetchLegacyMockSnapshot('/login', {
			headers: { cookie: cookieJarToHeader(legacyJar) ?? '' },
		});

		expect(loginGet.response.status).toBe(303);
		expect(legacyLoginGet.status).toBe(303);
		expect(normalizeLocation(loginGet.response.headers.get('location'))).toBe('/index.php/apps/dashboard/');
	});
});
