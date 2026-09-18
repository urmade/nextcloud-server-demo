import { describe, expect, it } from 'vitest';
import { compareParityResponses } from '../compare';
import { getParityEnv } from '../env';
import { fetchLegacyMockSnapshot } from '../legacy-mock/adapter';
import { formatParityMismatches, runParityCase } from '../harness';
import { cookieJarToHeader, mergeResponseCookies } from '../helpers/cookies';
import { loginParitySession } from '../helpers/session';

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

async function completeLegacyLoginFlowGrant(
	jar: Record<string, string>,
	loginPath: string,
): Promise<Record<string, string>> {
	const landing = await fetchLegacyMockSnapshot(loginPath, {
		method: 'GET',
		headers: {
			cookie: cookieJarToHeader(jar) ?? '',
		},
	});
	const flowPath = landing.headers.location?.replace('http://127.0.0.1:3100', '') ?? '/login/v2/flow';
	const flow = await fetchLegacyMockSnapshot(flowPath, {
		headers: {
			cookie: cookieJarToHeader(jar) ?? '',
		},
	});
	const flowHtml = typeof flow.body === 'string' ? flow.body : '';
	const grantUrlMatch = /data-grant-url="([^"]+)"/.exec(flowHtml);

	expect(grantUrlMatch).toBeTruthy();

	const grantUrl = new URL(grantUrlMatch?.[1] ?? '');
	const stateToken = grantUrl.searchParams.get('stateToken');

	expect(stateToken).toBeTruthy();

	const csrf = await fetchLegacyMockSnapshot('/csrftoken', {
		headers: {
			cookie: cookieJarToHeader(jar) ?? '',
		},
	});
	const csrfBody = csrf.body as { token: string };

	await fetchLegacyMockSnapshot('/login/v2/grant', {
		method: 'POST',
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
			cookie: cookieJarToHeader(jar) ?? '',
		},
		body: new URLSearchParams({
			stateToken: stateToken ?? '',
			requesttoken: csrfBody.token,
		}).toString(),
	});

	return jar;
}

async function completeLoginFlowGrant(
	baseUrl: string,
	jar: Record<string, string>,
	loginUrl: string,
): Promise<Record<string, string>> {
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

	const grantUrl = new URL(grantUrlMatch?.[1] ?? '');
	const stateToken = grantUrl.searchParams.get('stateToken');

	expect(stateToken).toBeTruthy();

	const csrfResponse = await fetch(`${baseUrl}/csrftoken`, {
		redirect: 'manual',
		headers: {
			cookie: cookieJarToHeader(updatedJar) ?? '',
		},
	});
	updatedJar = mergeResponseCookies(updatedJar, csrfResponse);
	const csrfBody = await csrfResponse.json() as { token: string };

	const grantResponse = await fetch(`${baseUrl}/login/v2/grant`, {
		method: 'POST',
		redirect: 'manual',
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
			cookie: cookieJarToHeader(updatedJar) ?? '',
		},
		body: new URLSearchParams({
			stateToken: stateToken ?? '',
			requesttoken: csrfBody.token,
		}).toString(),
	});

	return mergeResponseCookies(updatedJar, grantResponse);
}

describe('parity: core-login-v2', () => {
	it('POST /login/v2 happy path returns poll and login URLs', async () => {
		const result = await runParityCase({
			name: 'login-v2-init-happy',
			path: '/login/v2',
			options: {
				method: 'POST',
				headers: {
					'user-agent': 'parity-test-client',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				unstableIdPaths: ['poll.token', 'poll.endpoint', 'login'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /index.php/login/v2 matches /login/v2 init contract', async () => {
		const result = await runParityCase({
			name: 'login-v2-init-index-php-twin',
			path: '/index.php/login/v2',
			options: {
				method: 'POST',
				headers: {
					'user-agent': 'parity-test-client',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				unstableIdPaths: ['poll.token', 'poll.endpoint', 'login'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /login/v2/poll returns 404 for unknown token (auth failure)', async () => {
		const result = await runParityCase({
			name: 'login-v2-poll-unknown-token',
			path: '/login/v2/poll',
			options: {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
				},
				body: JSON.stringify({ token: 'unknown-poll-token' }),
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /login/v2/poll returns 404 before grant completes (validation)', async () => {
		const env = getParityEnv();
		const { pollToken } = await initLoginFlow(env.newBaseUrl);

		const result = await runParityCase({
			name: 'login-v2-poll-not-ready',
			path: '/login/v2/poll',
			options: {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
				},
				body: JSON.stringify({ token: pollToken }),
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /index.php/login/v2/poll matches poll contract', async () => {
		const result = await runParityCase({
			name: 'login-v2-poll-index-php-twin',
			path: '/index.php/login/v2/poll',
			options: {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
				},
				body: JSON.stringify({ token: 'unknown-poll-token' }),
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /login/v2/poll happy path returns credentials after grant', async () => {
		const env = getParityEnv();
		const { pollToken, loginUrl } = await initLoginFlow(env.newBaseUrl);
		const jar = await loginParitySession();
		await completeLoginFlowGrant(env.newBaseUrl, jar, loginUrl);

		const legacy = await initLegacyLoginFlow();
		const legacyJar = await loginParitySession();
		await completeLegacyLoginFlowGrant(legacyJar, legacy.loginPath);

		const [legacyPoll, newPoll] = await Promise.all([
			fetchLegacyMockSnapshot('/login/v2/poll', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
				},
				body: JSON.stringify({ token: legacy.pollToken }),
			}),
			fetch(`${env.newBaseUrl}/login/v2/poll`, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
				},
				body: JSON.stringify({ token: pollToken }),
				redirect: 'manual',
			}).then(async (response) => {
				const rawBody = await response.text();

				return {
					status: response.status,
					headers: {
						'content-type': response.headers.get('content-type') ?? '',
					},
					body: JSON.parse(rawBody),
					rawBody,
				};
			}),
		]);

		const mismatches = compareParityResponses(legacyPoll, {
			status: newPoll.status,
			headers: newPoll.headers,
			body: newPoll.body,
			rawBody: JSON.stringify(newPoll.body),
		}, {
			contractHeaders: ['content-type'],
			unstableIdPaths: ['server', 'loginName', 'appPassword'],
		});

		expect(mismatches, formatParityMismatches(mismatches)).toEqual([]);

		const replay = await fetch(`${env.newBaseUrl}/login/v2/poll`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
			},
			body: JSON.stringify({ token: pollToken }),
			redirect: 'manual',
		});

		expect(replay.status).toBe(404);
	});

	it('GET /login/v2/flow returns 403 without login flow session (auth failure)', async () => {
		const result = await runParityCase({
			name: 'login-v2-flow-unauth',
			path: '/login/v2/flow',
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /login/v2/flow/{token} redirects to flow page for valid token (validation)', async () => {
		const env = getParityEnv();
		const { loginUrl } = await initLoginFlow(env.newBaseUrl);
		const legacy = await initLegacyLoginFlow();

		const newResponse = await fetch(toFetchUrl(env.newBaseUrl, loginUrl), {
			redirect: 'manual',
		});
		const legacyLanding = await fetchLegacyMockSnapshot(legacy.loginPath, { method: 'GET' });

		expect(newResponse.status).toBe(303);
		expect(legacyLanding.status).toBe(303);
		expect(normalizeLocation(newResponse.headers.get('location'))).toBe('/login/v2/flow');
		expect(normalizeLocation(legacyLanding.headers.location ?? null)).toBe('/login/v2/flow');
	});

	it('GET /login/v2/flow happy path returns auth picker HTML', async () => {
		const env = getParityEnv();
		const { loginUrl } = await initLoginFlow(env.newBaseUrl);
		const legacy = await initLegacyLoginFlow();
		const jar = await loginParitySession();
		const legacyJar = await loginParitySession();

		const landingResponse = await fetch(toFetchUrl(env.newBaseUrl, loginUrl), {
			redirect: 'manual',
			headers: {
				cookie: cookieJarToHeader(jar) ?? '',
			},
		});
		const landingJar = mergeResponseCookies(jar, landingResponse);
		const flowLocation = landingResponse.headers.get('location');

		const legacyLanding = await fetchLegacyMockSnapshot(legacy.loginPath, {
			method: 'GET',
			headers: {
				cookie: cookieJarToHeader(legacyJar) ?? '',
			},
		});

		const [legacyFlow, newFlow] = await Promise.all([
			fetchLegacyMockSnapshot(legacyLanding.headers.location?.replace('http://127.0.0.1:3100', '') ?? '/login/v2/flow', {
				headers: {
					cookie: cookieJarToHeader(legacyJar) ?? '',
				},
			}),
			fetch(flowLocation ?? '', {
				redirect: 'manual',
				headers: {
					cookie: cookieJarToHeader(landingJar) ?? '',
				},
			}).then(async (response) => {
				const rawBody = await response.text();

				return {
					status: response.status,
					headers: {
						'content-type': response.headers.get('content-type') ?? '',
					},
					body: rawBody,
					rawBody,
				};
			}),
		]);

		expect(legacyFlow.status).toBe(200);
		expect(newFlow.status).toBe(200);
		expect(legacyFlow.headers['content-type']).toContain('text/html');
		expect(newFlow.headers['content-type']).toContain('text/html');
		expect(String(legacyFlow.body)).toContain('data-login-flow="auth"');
		expect(String(newFlow.body)).toContain('data-login-flow="auth"');
	});

	it('GET /login/v2/grant returns 303 login redirect when not logged in (auth failure)', async () => {
		const result = await runParityCase({
			name: 'login-v2-grant-get-unauth',
			path: '/login/v2/grant?stateToken=missing',
			options: {
				headers: {
					accept: 'text/html',
				},
			},
			compare: {
				contractHeaders: ['location'],
				ignoreHeaders: ['location'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /login/v2/grant returns 403 without state token (validation)', async () => {
		const jar = await loginParitySession();
		const env = getParityEnv();
		const csrfResponse = await fetch(`${env.newBaseUrl}/csrftoken`, {
			redirect: 'manual',
			headers: {
				cookie: cookieJarToHeader(jar) ?? '',
			},
		});
		const csrfJar = mergeResponseCookies(jar, csrfResponse);
		const csrfBody = await csrfResponse.json() as { token: string };

		const result = await runParityCase({
			name: 'login-v2-grant-post-missing-state',
			path: '/login/v2/grant',
			options: {
				method: 'POST',
				headers: {
					'content-type': 'application/x-www-form-urlencoded',
					cookie: cookieJarToHeader(csrfJar) ?? '',
				},
				body: new URLSearchParams({
					requesttoken: csrfBody.token,
				}).toString(),
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /login/v2/grant happy path completes flow', async () => {
		const env = getParityEnv();
		const { loginUrl } = await initLoginFlow(env.newBaseUrl);
		const jar = await loginParitySession();
		const finalJar = await completeLoginFlowGrant(env.newBaseUrl, jar, loginUrl);

		const response = await fetch(`${env.newBaseUrl}/login/v2/grant`, {
			method: 'POST',
			redirect: 'manual',
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				cookie: cookieJarToHeader(finalJar) ?? '',
			},
			body: new URLSearchParams({
				stateToken: 'already-used',
				requesttoken: 'invalid',
			}).toString(),
		});

		expect(response.status).toBe(403);
	});
});
