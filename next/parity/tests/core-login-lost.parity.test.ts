import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	computeDeterministicLostPasswordToken,
	LOST_PASSWORD_EXPIRED_TOKEN,
	setLostPasswordLinkConfig,
} from '@/src/server/auth/lost-password-store';
import { getParityEnv } from '../env';
import { fetchLegacyMockSnapshot } from '../legacy-mock/adapter';
import { formatParityMismatches, runParityCase } from '../harness';
import { resetParityAuthStores } from '../helpers/auth';
import { cookieJarToHeader, mergeResponseCookies, parseSetCookieHeader } from '../helpers/cookies';
import type { ParityResponseSnapshot } from '../types';

const JSON_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: ['status', 'msg', 'message', 'user', 'encryption'],
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

async function bootstrapNewCsrf(baseUrl: string, jar: Record<string, string> = {}): Promise<{
	jar: Record<string, string>;
	token: string;
}> {
	const csrfResponse = await fetch(`${baseUrl}/csrftoken`, {
		redirect: 'manual',
		headers: {
			cookie: cookieJarToHeader(jar) ?? '',
		},
	});
	const nextJar = mergeResponseCookies(jar, csrfResponse);
	const csrfBody = await csrfResponse.json() as { token: string };

	return {
		jar: nextJar,
		token: csrfBody.token,
	};
}

async function bootstrapLegacyCsrf(jar: Record<string, string> = {}): Promise<{
	jar: Record<string, string>;
	token: string;
}> {
	const snapshot = await fetchLegacyMockSnapshot('/csrftoken', {
		headers: {
			cookie: cookieJarToHeader(jar) ?? '',
		},
	});

	return {
		jar: mergeSnapshotCookies(jar, snapshot),
		token: (snapshot.body as { token: string }).token,
	};
}

async function postLostPasswordEmailLegacy(
	jar: Record<string, string>,
	csrfToken: string,
	user: string,
): Promise<ParityResponseSnapshot> {
	return fetchLegacyMockSnapshot('/lostpassword/email', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			accept: 'application/json',
			requesttoken: csrfToken,
			cookie: cookieJarToHeader(jar) ?? '',
		},
		body: JSON.stringify({ user }),
	});
}

async function postLostPasswordEmailNew(
	baseUrl: string,
	jar: Record<string, string>,
	csrfToken: string,
	user: string,
): Promise<Response> {
	return fetch(`${baseUrl}/lostpassword/email`, {
		method: 'POST',
		redirect: 'manual',
		headers: {
			'content-type': 'application/json',
			accept: 'application/json',
			requesttoken: csrfToken,
			cookie: cookieJarToHeader(jar) ?? '',
		},
		body: JSON.stringify({ user }),
	});
}

function adminResetToken(): string {
	return computeDeterministicLostPasswordToken('admin', 'admin@parity.test');
}

describe('parity: core-login-lost', () => {
	beforeEach(async () => {
		await resetParityAuthStores();
	});

	afterEach(async () => {
		await resetParityAuthStores();
	});

	it('POST /lostpassword/email happy path returns success JSON', async () => {
		const env = getParityEnv();
		const legacyCsrf = await bootstrapLegacyCsrf();
		const newCsrf = await bootstrapNewCsrf(env.newBaseUrl);

		const legacy = await postLostPasswordEmailLegacy(legacyCsrf.jar, legacyCsrf.token, 'admin');
		const response = await postLostPasswordEmailNew(env.newBaseUrl, newCsrf.jar, newCsrf.token, 'admin');

		expect(legacy.status).toBe(200);
		expect(response.status).toBe(200);
		expect(legacy.body).toEqual({ status: 'success' });
		expect(await response.json()).toEqual({ status: 'success' });
	});

	it('POST /index.php/lostpassword/email matches pretty twin', async () => {
		const env = getParityEnv();
		const legacyCsrf = await bootstrapLegacyCsrf();
		const newCsrf = await bootstrapNewCsrf(env.newBaseUrl);

		const legacyPretty = await postLostPasswordEmailLegacy(legacyCsrf.jar, legacyCsrf.token, 'admin');
		const legacyTwin = await fetchLegacyMockSnapshot('/index.php/lostpassword/email', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				accept: 'application/json',
				requesttoken: legacyCsrf.token,
				cookie: cookieJarToHeader(legacyCsrf.jar) ?? '',
			},
			body: JSON.stringify({ user: 'admin' }),
		});

		const prettyResponse = await postLostPasswordEmailNew(env.newBaseUrl, newCsrf.jar, newCsrf.token, 'admin');
		const twinResponse = await fetch(`${env.newBaseUrl}/index.php/lostpassword/email`, {
			method: 'POST',
			redirect: 'manual',
			headers: {
				'content-type': 'application/json',
				accept: 'application/json',
				requesttoken: newCsrf.token,
				cookie: cookieJarToHeader(newCsrf.jar) ?? '',
			},
			body: JSON.stringify({ user: 'admin' }),
		});

		expect(legacyPretty.body).toEqual({ status: 'success' });
		expect(legacyTwin.body).toEqual({ status: 'success' });
		expect(await prettyResponse.json()).toEqual({ status: 'success' });
		expect(await twinResponse.json()).toEqual({ status: 'success' });
	});

	it('POST /lostpassword/email requires CSRF (412 JSON)', async () => {
		const result = await runParityCase({
			name: 'lost-email-csrf-failure',
			path: '/lostpassword/email',
			options: {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					accept: 'application/json',
				},
				body: JSON.stringify({ user: 'admin' }),
			},
			compare: JSON_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /lostpassword/email rejects overlong user (200 error JSON)', async () => {
		const env = getParityEnv();
		const legacyCsrf = await bootstrapLegacyCsrf();
		const newCsrf = await bootstrapNewCsrf(env.newBaseUrl);
		const overlongUser = 'a'.repeat(256);

		const legacy = await postLostPasswordEmailLegacy(legacyCsrf.jar, legacyCsrf.token, overlongUser);
		const response = await postLostPasswordEmailNew(env.newBaseUrl, newCsrf.jar, newCsrf.token, overlongUser);

		expect(legacy.status).toBe(200);
		expect(response.status).toBe(200);
		expect(legacy.body).toEqual({
			status: 'error',
			msg: 'Unsupported email length (>255)',
		});
		expect(await response.json()).toEqual({
			status: 'error',
			msg: 'Unsupported email length (>255)',
		});
	});

	it('POST /lostpassword/email returns same success for unknown user', async () => {
		const env = getParityEnv();
		const legacyCsrf = await bootstrapLegacyCsrf();
		const newCsrf = await bootstrapNewCsrf(env.newBaseUrl);

		const legacy = await postLostPasswordEmailLegacy(legacyCsrf.jar, legacyCsrf.token, 'nobody-here');
		const response = await postLostPasswordEmailNew(env.newBaseUrl, newCsrf.jar, newCsrf.token, 'nobody-here');

		expect(legacy.status).toBe(200);
		expect(response.status).toBe(200);
		expect(legacy.body).toEqual({ status: 'success' });
		expect(await response.json()).toEqual({ status: 'success' });
	});

	it('GET /lostpassword/reset/form/{token}/{userId} happy path renders reset form', async () => {
		const env = getParityEnv();
		const legacyCsrf = await bootstrapLegacyCsrf();
		const newCsrf = await bootstrapNewCsrf(env.newBaseUrl);

		await postLostPasswordEmailLegacy(legacyCsrf.jar, legacyCsrf.token, 'admin');
		await postLostPasswordEmailNew(env.newBaseUrl, newCsrf.jar, newCsrf.token, 'admin');

		const resetToken = adminResetToken();
		const path = `/lostpassword/reset/form/${encodeURIComponent(resetToken)}/admin`;

		const legacy = await fetchLegacyMockSnapshot(path);
		const response = await fetch(`${env.newBaseUrl}${path}`, { redirect: 'manual' });
		const legacyHtml = legacy.rawBody;
		const html = await response.text();

		expect(legacy.status).toBe(200);
		expect(response.status).toBe(200);
		expect(legacyHtml).toContain('data-reset-password-user="admin"');
		expect(html).toContain('data-reset-password-user="admin"');
		expect(legacyHtml).toContain('data-reset-password-target=');
		expect(html).toContain('data-reset-password-target=');
	});

	it('GET /lostpassword/reset/form invalid token returns error HTML (200)', async () => {
		const result = await runParityCase({
			name: 'lost-resetform-invalid-token',
			path: '/lostpassword/reset/form/invalid-token/admin',
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /lostpassword/reset/form expired token returns error HTML (200)', async () => {
		const result = await runParityCase({
			name: 'lost-resetform-expired-token',
			path: `/lostpassword/reset/form/${encodeURIComponent(LOST_PASSWORD_EXPIRED_TOKEN)}/admin`,
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /lostpassword/set/{token}/{userId} happy path resets password', async () => {
		const env = getParityEnv();
		const legacyCsrf = await bootstrapLegacyCsrf();
		const newCsrf = await bootstrapNewCsrf(env.newBaseUrl);

		await postLostPasswordEmailLegacy(legacyCsrf.jar, legacyCsrf.token, 'admin');
		await postLostPasswordEmailNew(env.newBaseUrl, newCsrf.jar, newCsrf.token, 'admin');

		const resetToken = adminResetToken();
		const path = `/lostpassword/set/${encodeURIComponent(resetToken)}/admin`;
		const body = JSON.stringify({
			password: 'new-parity-password',
			proceed: true,
		});

		const legacy = await fetchLegacyMockSnapshot(path, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				accept: 'application/json',
				requesttoken: legacyCsrf.token,
				cookie: cookieJarToHeader(legacyCsrf.jar) ?? '',
			},
			body,
		});

		const response = await fetch(`${env.newBaseUrl}${path}`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				accept: 'application/json',
				requesttoken: newCsrf.token,
				cookie: cookieJarToHeader(newCsrf.jar) ?? '',
			},
			body,
		});

		expect(legacy.status).toBe(200);
		expect(response.status).toBe(200);
		expect(legacy.body).toEqual({
			status: 'success',
			user: 'admin',
		});
		expect(await response.json()).toEqual({
			status: 'success',
			user: 'admin',
		});
	});

	it('POST /lostpassword/set requires CSRF (412 JSON)', async () => {
		const result = await runParityCase({
			name: 'lost-set-password-csrf-failure',
			path: `/lostpassword/set/${encodeURIComponent(adminResetToken())}/admin`,
			options: {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					accept: 'application/json',
				},
				body: JSON.stringify({
					password: 'new-parity-password',
					proceed: true,
				}),
			},
			compare: JSON_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /lostpassword/set rejects invalid token (200 error JSON)', async () => {
		const env = getParityEnv();
		const legacyCsrf = await bootstrapLegacyCsrf();
		const newCsrf = await bootstrapNewCsrf(env.newBaseUrl);
		const path = '/lostpassword/set/invalid-token/admin';
		const body = JSON.stringify({
			password: 'new-parity-password',
			proceed: true,
		});

		const legacy = await fetchLegacyMockSnapshot(path, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				accept: 'application/json',
				requesttoken: legacyCsrf.token,
				cookie: cookieJarToHeader(legacyCsrf.jar) ?? '',
			},
			body,
		});

		const response = await fetch(`${env.newBaseUrl}${path}`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				accept: 'application/json',
				requesttoken: newCsrf.token,
				cookie: cookieJarToHeader(newCsrf.jar) ?? '',
			},
			body,
		});

		expect(legacy.status).toBe(200);
		expect(response.status).toBe(200);
		expect(legacy.body).toEqual({
			status: 'error',
			msg: 'Could not reset password because the token is invalid',
		});
		expect(await response.json()).toEqual({
			status: 'error',
			msg: 'Could not reset password because the token is invalid',
		});
	});

	it('POST /lostpassword/set rejects overlong password (200 error JSON)', async () => {
		const env = getParityEnv();
		const legacyCsrf = await bootstrapLegacyCsrf();
		const newCsrf = await bootstrapNewCsrf(env.newBaseUrl);

		await postLostPasswordEmailLegacy(legacyCsrf.jar, legacyCsrf.token, 'admin');
		await postLostPasswordEmailNew(env.newBaseUrl, newCsrf.jar, newCsrf.token, 'admin');

		const resetToken = adminResetToken();
		const path = `/lostpassword/set/${encodeURIComponent(resetToken)}/admin`;
		const body = JSON.stringify({
			password: 'x'.repeat(470),
			proceed: true,
		});

		const legacy = await fetchLegacyMockSnapshot(path, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				accept: 'application/json',
				requesttoken: legacyCsrf.token,
				cookie: cookieJarToHeader(legacyCsrf.jar) ?? '',
			},
			body,
		});

		const response = await fetch(`${env.newBaseUrl}${path}`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				accept: 'application/json',
				requesttoken: newCsrf.token,
				cookie: cookieJarToHeader(newCsrf.jar) ?? '',
			},
			body,
		});

		expect(legacy.status).toBe(200);
		expect(response.status).toBe(200);
		expect(legacy.body).toEqual({
			status: 'error',
			msg: 'Password is too long. Maximum allowed length is 469 characters.',
		});
		expect(await response.json()).toEqual({
			status: 'error',
			msg: 'Password is too long. Maximum allowed length is 469 characters.',
		});
	});

	it('POST /lostpassword/set missing proceed returns 400 empty', async () => {
		const env = getParityEnv();
		const legacyCsrf = await bootstrapLegacyCsrf();
		const newCsrf = await bootstrapNewCsrf(env.newBaseUrl);

		await postLostPasswordEmailLegacy(legacyCsrf.jar, legacyCsrf.token, 'admin');
		await postLostPasswordEmailNew(env.newBaseUrl, newCsrf.jar, newCsrf.token, 'admin');

		const resetToken = adminResetToken();
		const path = `/lostpassword/set/${encodeURIComponent(resetToken)}/admin`;

		const legacy = await fetchLegacyMockSnapshot(path, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				accept: 'application/json',
				requesttoken: legacyCsrf.token,
				cookie: cookieJarToHeader(legacyCsrf.jar) ?? '',
			},
			body: JSON.stringify({ password: 'new-parity-password' }),
		});

		const response = await fetch(`${env.newBaseUrl}${path}`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				accept: 'application/json',
				requesttoken: newCsrf.token,
				cookie: cookieJarToHeader(newCsrf.jar) ?? '',
			},
			body: JSON.stringify({ password: 'new-parity-password' }),
		});

		expect(legacy.status).toBe(400);
		expect(response.status).toBe(400);
		expect(legacy.rawBody).toBe('');
		expect(await response.text()).toBe('');
	});

	it('POST /lostpassword/email returns disabled error when lost_password_link is set (legacy mock)', async () => {
		setLostPasswordLinkConfig('disabled');

		const legacyCsrf = await bootstrapLegacyCsrf();
		const legacy = await postLostPasswordEmailLegacy(legacyCsrf.jar, legacyCsrf.token, 'admin');

		expect(legacy.status).toBe(200);
		expect(legacy.body).toEqual({
			status: 'error',
			msg: 'Password reset is disabled',
		});
	});
});
