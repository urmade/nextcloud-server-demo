import { describe, expect, it } from 'vitest';
import { getParityEnv } from '../env';
import { fetchLegacyMockSnapshot } from '../legacy-mock/adapter';
import { formatParityMismatches, runParityCase } from '../harness';
import { cookieJarToHeader, mergeResponseCookies } from '../helpers/cookies';
import {
	fetchParityCsrfToken,
	loginParitySession,
	OCS_JSON_HEADERS,
	seedParityGuestSessionFromJar,
	seedParityLoginFlowV2Session,
} from '../helpers/session';
import { storeAppPasswordToken } from '@/src/server/ocs/app-password-store';

const PARITY_CLIENT_HOST = 'cloud.example.test';

function normalizeLocation(location: string | null): string | null {
	if (!location) {
		return null;
	}

	try {
		const url = new URL(location, 'http://127.0.0.1:3100');

		return `${url.pathname}${url.search}`;
	} catch {
		return location;
	}
}

function parityClientHeaders(extra: Record<string, string> = {}): Record<string, string> {
	return {
		host: PARITY_CLIENT_HOST,
		'x-forwarded-host': PARITY_CLIENT_HOST,
		'x-forwarded-proto': 'https',
		...extra,
	};
}

function expectedClientOrigin(headers: Record<string, string> = parityClientHeaders()): string {
	const host = headers['x-forwarded-host'] ?? headers.host ?? '127.0.0.1:3100';
	const proto = headers['x-forwarded-proto'] ?? 'http';

	return `${proto}://${host}`;
}

function expectLocationMatches(
	location: string | null,
	expectedOrigin: string,
	expectedPath: string,
): void {
	expect(location).toBeTruthy();

	const url = new URL(location ?? '');

	expect(url.origin).toBe(expectedOrigin);
	expect(`${url.pathname}${url.search}`).toBe(expectedPath);
}

function toFetchUrl(baseUrl: string, absoluteOrRelative: string): string {
	if (!absoluteOrRelative.startsWith('http')) {
		return `${baseUrl}${absoluteOrRelative}`;
	}

	const target = new URL(absoluteOrRelative);
	const base = new URL(baseUrl);

	return `${base.origin}${target.pathname}${target.search}`;
}

async function initLoginFlow(baseUrl: string, userAgent = 'parity-test-client'): Promise<{
	pollToken: string;
	loginUrl: string;
	jar: Record<string, string>;
}> {
	const response = await fetch(`${baseUrl}/login/v2`, {
		method: 'POST',
		headers: {
			'user-agent': userAgent,
		},
		redirect: 'manual',
	});
	const jar = mergeResponseCookies({}, response);
	const body = await response.json() as {
		poll: { token: string; endpoint: string };
		login: string;
	};

	return {
		pollToken: body.poll.token,
		loginUrl: body.login,
		jar,
	};
}

async function initLegacyLoginFlow(userAgent = 'parity-test-client'): Promise<{
	pollToken: string;
	loginPath: string;
}> {
	const snapshot = await fetchLegacyMockSnapshot('/login/v2', {
		method: 'POST',
		headers: {
			'user-agent': userAgent,
		},
	});
	const body = snapshot.body as {
		poll: { token: string; endpoint: string };
		login: string;
	};

	return {
		pollToken: body.poll.token,
		loginPath: body.login.replace('http://127.0.0.1:3100', ''),
	};
}

async function openAuthPicker(
	baseUrl: string,
	loginUrl: string,
	jar: Record<string, string>,
): Promise<{ jar: Record<string, string>; stateToken: string }> {
	const landingResponse = await fetch(toFetchUrl(baseUrl, loginUrl), {
		redirect: 'manual',
		headers: {
			cookie: cookieJarToHeader(jar) ?? '',
		},
	});
	let updatedJar = mergeResponseCookies(jar, landingResponse);
	const flowLocation = landingResponse.headers.get('location');

	expect(flowLocation).toBeTruthy();

	const flowResponse = await fetch(flowLocation ?? '', {
		redirect: 'manual',
		headers: {
			cookie: cookieJarToHeader(updatedJar) ?? '',
		},
	});
	updatedJar = mergeResponseCookies(updatedJar, flowResponse);
	const flowHtml = await flowResponse.text();
	const grantUrlMatch = /data-grant-url="([^"]+)"/.exec(flowHtml);

	expect(grantUrlMatch).toBeTruthy();

	const grantUrl = new URL(grantUrlMatch?.[1] ?? '', baseUrl);
	const stateToken = grantUrl.searchParams.get('stateToken');

	expect(stateToken).toBeTruthy();

	return {
		jar: updatedJar,
		stateToken: stateToken ?? '',
	};
}

function extractLoginToken(loginUrl: string): string {
	const url = new URL(loginUrl, 'http://127.0.0.1:3100');
	const match = /^\/login\/v2\/flow\/([^/]+)$/.exec(url.pathname);

	return match?.[1] ? decodeURIComponent(match[1]) : '';
}

async function seedApptokenParitySession(
	jar: Record<string, string>,
	loginUrl: string,
	stateToken: string,
	pollToken: string,
): Promise<{ jar: Record<string, string>; token: string }> {
	const env = getParityEnv();
	const csrf = await fetchParityCsrfToken(jar, env.newBaseUrl);

	seedParityGuestSessionFromJar(csrf.jar, csrf.token);
	seedParityLoginFlowV2Session(
		csrf.jar,
		extractLoginToken(loginUrl),
		stateToken,
		pollToken,
	);

	return csrf;
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

describe('parity: core-login-v2-html', () => {
	it('GET /login/v2/flow/{token} invalid token returns 403 HTML (core.ClientFlowLoginV2#landing)', async () => {
		const env = getParityEnv();

		const result = await runParityCase({
			name: 'login-v2-landing-invalid-token',
			path: '/login/v2/flow/invalid-login-token',
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		const response = await fetch(`${env.newBaseUrl}/login/v2/flow/invalid-login-token`, {
			redirect: 'manual',
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
		expect(response.status).toBe(403);
		expect(await response.text()).toContain('invalid or has expired');
	});

	it('GET /login/v2/flow/{token} valid token redirects to /login/v2/flow (core.ClientFlowLoginV2#landing)', async () => {
		const env = getParityEnv();
		const clientHeaders = parityClientHeaders();
		const expectedOrigin = expectedClientOrigin(clientHeaders);
		const { loginUrl } = await initLoginFlow(env.newBaseUrl);
		const legacy = await initLegacyLoginFlow();

		const newResponse = await fetch(toFetchUrl(env.newBaseUrl, loginUrl), {
			redirect: 'manual',
			headers: clientHeaders,
		});
		const legacyLanding = await fetchLegacyMockSnapshot(legacy.loginPath, {
			method: 'GET',
			headers: clientHeaders,
		});

		expect(newResponse.status).toBe(303);
		expect(legacyLanding.status).toBe(303);
		expectLocationMatches(newResponse.headers.get('location'), expectedOrigin, '/login/v2/flow');
		expectLocationMatches(legacyLanding.headers.location ?? null, expectedOrigin, '/login/v2/flow');
	});

	it('GET /login/v2/grant missing state returns 403 HTML when logged in (core.ClientFlowLoginV2#grantPage)', async () => {
		const env = getParityEnv();
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'login-v2-grant-get-missing-state',
			path: '/login/v2/grant',
			options: {
				headers: {
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		const response = await fetch(`${env.newBaseUrl}/login/v2/grant`, {
			redirect: 'manual',
			headers: {
				cookie: cookieJarToHeader(jar) ?? '',
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
		expect(response.status).toBe(403);
		expect(await response.text()).toContain('State token missing');
	});

	it('GET /login/v2/grant unauthenticated returns 303 login redirect (core.ClientFlowLoginV2#grantPage)', async () => {
		const env = getParityEnv();
		const clientHeaders = parityClientHeaders({ accept: 'text/html' });
		const expectedOrigin = expectedClientOrigin(clientHeaders);

		const result = await runParityCase({
			name: 'login-v2-grant-get-unauth',
			path: '/login/v2/grant?stateToken=missing',
			options: {
				headers: clientHeaders,
			},
			compare: {
				contractHeaders: ['location'],
				ignoreHeaders: ['location'],
			},
		});

		const [response, legacy] = await Promise.all([
			fetch(`${env.newBaseUrl}/login/v2/grant?stateToken=missing`, {
				redirect: 'manual',
				headers: clientHeaders,
			}),
			fetchLegacyMockSnapshot('/login/v2/grant?stateToken=missing', {
				headers: clientHeaders,
			}),
		]);

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
		expect(response.status).toBe(303);
		expect(legacy.status).toBe(303);
		expectLocationMatches(response.headers.get('location'), expectedOrigin, '/login?redirect_url=%2Flogin%2Fv2%2Fgrant%3FstateToken%3Dmissing');
		expectLocationMatches(legacy.headers.location ?? null, expectedOrigin, '/login?redirect_url=%2Flogin%2Fv2%2Fgrant%3FstateToken%3Dmissing');
	});

	it('POST /login/v2/apptoken without CSRF returns 412 (core.ClientFlowLoginV2#apptokenRedirect.post)', async () => {
		const env = getParityEnv();
		const { loginUrl, pollToken } = await initLoginFlow(env.newBaseUrl);
		const { jar, stateToken } = await openAuthPicker(env.newBaseUrl, loginUrl, {});
		await seedApptokenParitySession(jar, loginUrl, stateToken, pollToken);

		const result = await runParityCase({
			name: 'login-v2-apptoken-no-csrf',
			path: '/login/v2/apptoken',
			options: {
				method: 'POST',
				headers: {
					'content-type': 'application/x-www-form-urlencoded',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: new URLSearchParams({
					stateToken,
					user: 'admin',
					password: 'invalid-app-password',
				}).toString(),
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		const response = await fetch(`${env.newBaseUrl}/login/v2/apptoken`, {
			method: 'POST',
			redirect: 'manual',
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				cookie: cookieJarToHeader(jar) ?? '',
			},
			body: new URLSearchParams({
				stateToken,
				user: 'admin',
				password: 'invalid-app-password',
			}).toString(),
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
		expect(response.status).toBe(412);
	});

	it('POST /login/v2/apptoken invalid app password returns 403 HTML (core.ClientFlowLoginV2#apptokenRedirect.post)', async () => {
		const env = getParityEnv();
		const { loginUrl, pollToken } = await initLoginFlow(env.newBaseUrl);
		const { jar, stateToken } = await openAuthPicker(env.newBaseUrl, loginUrl, {});
		const csrf = await seedApptokenParitySession(jar, loginUrl, stateToken, pollToken);

		const result = await runParityCase({
			name: 'login-v2-apptoken-bad-password',
			path: '/login/v2/apptoken',
			options: {
				method: 'POST',
				headers: {
					'content-type': 'application/x-www-form-urlencoded',
					cookie: cookieJarToHeader(csrf.jar) ?? '',
				},
				body: new URLSearchParams({
					stateToken,
					user: 'admin',
					password: 'invalid-app-password',
					requesttoken: csrf.token,
				}).toString(),
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /login/v2/apptoken happy path returns 200 done HTML and poll credentials (core.ClientFlowLoginV2#apptokenRedirect.post)', async () => {
		const env = getParityEnv();
		const loginJar = await loginParitySession();
		const appPassword = await createAppPassword(loginJar);
		storeAppPasswordToken('admin', 'admin', appPassword, 'parity-test');

		const { loginUrl, pollToken, jar: initJar } = await initLoginFlow(env.newBaseUrl);
		const { jar, stateToken } = await openAuthPicker(env.newBaseUrl, loginUrl, initJar);
		const csrf = await seedApptokenParitySession(jar, loginUrl, stateToken, pollToken);

		const result = await runParityCase({
			name: 'login-v2-apptoken-happy',
			path: '/login/v2/apptoken',
			options: {
				method: 'POST',
				headers: {
					'content-type': 'application/x-www-form-urlencoded',
					cookie: cookieJarToHeader(csrf.jar) ?? '',
				},
				body: new URLSearchParams({
					stateToken,
					user: 'admin',
					password: appPassword,
					requesttoken: csrf.token,
				}).toString(),
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const pollResponse = await fetch(`${env.newBaseUrl}/login/v2/poll`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
			},
			body: JSON.stringify({ token: pollToken }),
			redirect: 'manual',
		});
		const pollBody = await pollResponse.json() as { server: string; loginName: string; appPassword: string };

		expect(pollResponse.status).toBe(200);
		expect(pollBody.loginName).toBe('admin');
		expect(pollBody.appPassword).toBe(appPassword);
	});
});
