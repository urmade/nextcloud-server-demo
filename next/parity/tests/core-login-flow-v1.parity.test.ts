import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compareParityResponses, snapshotResponse } from '../compare';
import { getParityEnv } from '../env';
import { fetchLegacyMockSnapshot } from '../legacy-mock/adapter';
import { formatParityMismatches, runParityCase } from '../harness';
import { resetParityAuthStores } from '../helpers/auth';
import { cookieJarToHeader, mergeResponseCookies } from '../helpers/cookies';
import {
	expireParityPasswordConfirmation,
	fetchParityCsrfToken,
	loginParitySession,
	loginParitySessionWithCsrf,
	seedParityGuestSessionFromJar,
	seedParityLoginFlowV1Session,
	seedParitySessionFromJar,
} from '../helpers/session';
import { isAppPasswordTokenFormat, storeAppPasswordToken } from '@/src/server/ocs/app-password-store';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';

const NC_LOGIN_REDIRECT = /^nc:\/\/login\/server:(?<server>[^&]+)&user:(?<user>[^&]+)&password:(?<password>.+)$/;

interface V1GeneratePostSetup {
	jar: Record<string, string>;
	csrfToken: string;
	stateToken: string;
}

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

function parseNcLoginRedirect(location: string | undefined): { server: string; user: string; password: string } {
	const groups = NC_LOGIN_REDIRECT.exec(location ?? '')?.groups;

	expect(groups, `expected an nc:// login redirect, got ${location}`).toBeTruthy();

	return groups as unknown as { server: string; user: string; password: string };
}

async function fetchNewSnapshot(path: string, options: ParityRequestOptions): Promise<ParityResponseSnapshot> {
	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}${path}`, {
		method: options.method ?? 'GET',
		headers: options.headers,
		body: options.body,
		redirect: 'manual',
	});

	return snapshotResponse(response, await response.text());
}

/**
 * Log in, open the auth picker over HTTP and mirror the resulting state token into
 * the legacy-mock session store. `POST /login/flow` consumes the state token, and
 * the Next.js server and the Vitest-process mock keep separate session stores, so
 * each side needs its own copy of the same token before the case runs.
 */
async function seedV1GeneratePostSession(): Promise<V1GeneratePostSetup> {
	const env = getParityEnv();
	const login = await loginParitySessionWithCsrf();
	const { jar, stateToken } = await openV1AuthPicker(env.newBaseUrl, login.jar);

	seedParitySessionFromJar(jar, login.csrfToken);
	seedParityLoginFlowV1Session(jar, stateToken, login.csrfToken);

	return {
		jar,
		csrfToken: login.csrfToken,
		stateToken,
	};
}

function v1GeneratePostOptions(setup: V1GeneratePostSetup): ParityRequestOptions {
	return {
		method: 'POST',
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
			cookie: cookieJarToHeader(setup.jar) ?? '',
		},
		body: new URLSearchParams({
			stateToken: setup.stateToken,
			requesttoken: setup.csrfToken,
		}).toString(),
	};
}

async function openV1AuthPicker(
	baseUrl: string,
	jar: Record<string, string> = {},
): Promise<{ jar: Record<string, string>; stateToken: string }> {
	const response = await fetch(`${baseUrl}/login/flow`, {
		redirect: 'manual',
		headers: {
			'OCS-APIREQUEST': 'true',
			cookie: cookieJarToHeader(jar) ?? '',
		},
	});
	const updatedJar = mergeResponseCookies(jar, response);
	const html = await response.text();
	const grantUrlMatch = /data-grant-url="([^"]+)"/.exec(html);

	expect(grantUrlMatch).toBeTruthy();

	const grantUrl = new URL(grantUrlMatch?.[1] ?? '', baseUrl);
	const stateToken = grantUrl.searchParams.get('stateToken');

	expect(stateToken).toBeTruthy();

	return {
		jar: updatedJar,
		stateToken: stateToken ?? '',
	};
}

describe('parity: core-login-flow-v1', () => {
	beforeEach(async () => {
		await resetParityAuthStores();
	});

	afterEach(async () => {
		await resetParityAuthStores();
	});

	it('GET /login/flow without OCS header returns 200 error template (core.ClientFlowLogin#showAuthPickerPage)', async () => {
		const env = getParityEnv();

		const result = await runParityCase({
			name: 'login-flow-v1-invalid-request',
			path: '/login/flow',
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		const response = await fetch(`${env.newBaseUrl}/login/flow`, {
			redirect: 'manual',
		});

		const body = await response.text();

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
		expect(response.status).toBe(200);
		expect(body).toContain('Access Forbidden');
		expect(body).not.toContain('core-loginflow');
	});

	it('GET /login/flow with OCS-APIREQUEST returns 200 auth picker (core.ClientFlowLogin#showAuthPickerPage)', async () => {
		const env = getParityEnv();

		const response = await fetch(`${env.newBaseUrl}/login/flow`, {
			redirect: 'manual',
			headers: {
				'OCS-APIREQUEST': 'true',
			},
		});
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('text/html');
		expect(html).toContain('id="core-loginflow"');
		expect(html).toMatch(/data-grant-url="[^"]+"/);
	});

	it('GET /login/flow/grant unauthenticated returns 303 login redirect (core.ClientFlowLogin#grantPage)', async () => {
		const env = getParityEnv();

		const result = await runParityCase({
			name: 'login-flow-v1-grant-unauth',
			path: '/login/flow/grant?stateToken=missing',
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

		const response = await fetch(`${env.newBaseUrl}/login/flow/grant?stateToken=missing`, {
			redirect: 'manual',
			headers: {
				accept: 'text/html',
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
		expect(response.status).toBe(303);
		expect(normalizeLocation(response.headers.get('location'))).toContain('/login');
	});

	it('GET /login/flow/grant bad state returns 403 HTML when logged in (core.ClientFlowLogin#grantPage)', async () => {
		const env = getParityEnv();
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'login-flow-v1-grant-bad-state',
			path: '/login/flow/grant?stateToken=wrong-token',
			options: {
				headers: {
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		const response = await fetch(`${env.newBaseUrl}/login/flow/grant?stateToken=wrong-token`, {
			redirect: 'manual',
			headers: {
				cookie: cookieJarToHeader(jar) ?? '',
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
		expect(response.status).toBe(403);
		expect(await response.text()).toContain('State token does not match');
	});

	it('POST /login/flow without CSRF returns 412 (core.ClientFlowLogin#generateAppPassword.post)', async () => {
		const env = getParityEnv();
		const setup = await seedV1GeneratePostSession();

		const result = await runParityCase({
			name: 'login-flow-v1-generate-no-csrf',
			path: '/login/flow',
			options: {
				method: 'POST',
				headers: {
					'content-type': 'application/x-www-form-urlencoded',
					cookie: cookieJarToHeader(setup.jar) ?? '',
				},
				body: new URLSearchParams({
					stateToken: setup.stateToken,
				}).toString(),
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		const response = await fetch(`${env.newBaseUrl}/login/flow`, {
			method: 'POST',
			redirect: 'manual',
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				cookie: cookieJarToHeader(setup.jar) ?? '',
			},
			body: new URLSearchParams({
				stateToken: setup.stateToken,
			}).toString(),
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
		expect(response.status).toBe(412);
	});

	it('POST /login/flow stale password confirm returns 403 with not-confirmed header (core.ClientFlowLogin#generateAppPassword.post)', async () => {
		const setup = await seedV1GeneratePostSession();
		await expireParityPasswordConfirmation(setup.jar);

		const options = v1GeneratePostOptions(setup);
		const legacySnapshot = await fetchLegacyMockSnapshot('/login/flow', options);
		const newSnapshot = await fetchNewSnapshot('/login/flow', options);
		const mismatches = compareParityResponses(legacySnapshot, newSnapshot, {
			contractHeaders: ['content-type', 'x-nc-auth-notconfirmed'],
		});

		expect(mismatches, formatParityMismatches(mismatches)).toEqual([]);
		expect(newSnapshot.status).toBe(403);
		expect(newSnapshot.headers['x-nc-auth-notconfirmed']).toBe('true');
		expect(newSnapshot.rawBody).toContain('Password confirmation is required');
	});

	it('POST /login/flow happy path returns 303 nc:// redirect (core.ClientFlowLogin#generateAppPassword.post)', async () => {
		const setup = await seedV1GeneratePostSession();

		const options = v1GeneratePostOptions(setup);
		const legacySnapshot = await fetchLegacyMockSnapshot('/login/flow', options);
		const newSnapshot = await fetchNewSnapshot('/login/flow', options);
		const mismatches = compareParityResponses(legacySnapshot, newSnapshot, {
			contractHeaders: ['content-type'],
			// Each side mints its own app password, so the redirect is compared field
			// by field below instead of as one opaque header value.
			ignoreHeaders: ['location'],
		});

		expect(mismatches, formatParityMismatches(mismatches)).toEqual([]);
		expect(newSnapshot.status).toBe(303);

		const legacyRedirect = parseNcLoginRedirect(legacySnapshot.headers.location);
		const newRedirect = parseNcLoginRedirect(newSnapshot.headers.location);

		expect(newRedirect.server).toBe(legacyRedirect.server);
		expect(newRedirect.user).toBe(legacyRedirect.user);
		expect(newRedirect.user).toBe('admin');
		expect(isAppPasswordTokenFormat(legacyRedirect.password)).toBe(true);
		expect(isAppPasswordTokenFormat(newRedirect.password)).toBe(true);
	});

	it('POST /login/flow/apptoken without CSRF returns 412 (core.ClientFlowLogin#apptokenRedirect.post)', async () => {
		const env = getParityEnv();
		const csrf = await fetchParityCsrfToken({});
		const { jar, stateToken } = await openV1AuthPicker(env.newBaseUrl, csrf.jar);

		seedParityGuestSessionFromJar(jar, csrf.token);
		seedParityLoginFlowV1Session(jar, stateToken, csrf.token);

		const result = await runParityCase({
			name: 'login-flow-v1-apptoken-no-csrf',
			path: '/login/flow/apptoken',
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

		const response = await fetch(`${env.newBaseUrl}/login/flow/apptoken`, {
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

	it('POST /login/flow/apptoken invalid app password returns 403 HTML (core.ClientFlowLogin#apptokenRedirect.post)', async () => {
		const env = getParityEnv();
		const csrf = await fetchParityCsrfToken({});
		const { jar, stateToken } = await openV1AuthPicker(env.newBaseUrl, csrf.jar);

		seedParityGuestSessionFromJar(jar, csrf.token);
		seedParityLoginFlowV1Session(jar, stateToken, csrf.token);

		const result = await runParityCase({
			name: 'login-flow-v1-apptoken-bad-password',
			path: '/login/flow/apptoken',
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
					requesttoken: csrf.token,
				}).toString(),
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		const response = await fetch(`${env.newBaseUrl}/login/flow/apptoken`, {
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
				requesttoken: csrf.token,
			}).toString(),
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
		expect(response.status).toBe(403);
		expect(await response.text()).toContain('Invalid app password');
	});

	it('POST /login/flow/apptoken happy path returns 303 nc:// redirect (core.ClientFlowLogin#apptokenRedirect.post)', async () => {
		const env = getParityEnv();
		const loginJar = await loginParitySession();
		const appPasswordResponse = await fetch(`${env.newBaseUrl}/ocs/v2.php/core/getapppassword?format=json`, {
			headers: {
				'OCS-APIRequest': 'true',
				Accept: 'application/json',
				cookie: cookieJarToHeader(loginJar) ?? '',
				'user-agent': 'parity-test',
			},
		});
		const appPasswordBody = await appPasswordResponse.json() as { ocs: { data: { apppassword: string } } };
		const appPassword = appPasswordBody.ocs.data.apppassword;
		storeAppPasswordToken('admin', 'admin', appPassword, 'parity-test');

		const csrf = await fetchParityCsrfToken({});
		const { jar, stateToken } = await openV1AuthPicker(env.newBaseUrl, csrf.jar);

		seedParityGuestSessionFromJar(jar, csrf.token);
		seedParityLoginFlowV1Session(jar, stateToken, csrf.token);

		const result = await runParityCase({
			name: 'login-flow-v1-apptoken-happy',
			path: '/login/flow/apptoken',
			options: {
				method: 'POST',
				headers: {
					'content-type': 'application/x-www-form-urlencoded',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: new URLSearchParams({
					stateToken,
					user: 'admin',
					password: appPassword,
					requesttoken: csrf.token,
				}).toString(),
			},
			compare: {
				contractHeaders: ['location'],
			},
		});

		const response = await fetch(`${env.newBaseUrl}/login/flow/apptoken`, {
			method: 'POST',
			redirect: 'manual',
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				cookie: cookieJarToHeader(jar) ?? '',
			},
			body: new URLSearchParams({
				stateToken,
				user: 'admin',
				password: appPassword,
				requesttoken: csrf.token,
			}).toString(),
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toMatch(/^nc:\/\/login\/server:http:\/\/(127\.0\.0\.1|localhost):3100&user:admin&password:/);
	});
});
