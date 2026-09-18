import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	encryptMailVerificationKey,
	MAIL_VERIFY_EXPIRED_TOKEN,
} from '@/src/server/provisioning/mail-verify';
import { getParityEnv } from '../env';
import { formatParityMismatches, runParityCase } from '../harness';
import { cookieJarToHeader } from '../helpers/cookies';
import {
	removeParityProvisioningEmail,
	resetParityProvisioningStores,
	seedParityMailVerification,
} from '../helpers/provisioning-self-read';
import {
	loginParitySession,
	loginParitySessionWithCsrf,
} from '../helpers/session';

const HTML_COMPARE = {
	contractHeaders: ['content-type'],
};

const HTML_HEADERS = {
	Accept: 'text/html',
};

const JSON_HEADERS = {
	Accept: 'application/json',
};

function mailVerifyPath(userId: string, email: string, token: string): string {
	const key = encodeURIComponent(encryptMailVerificationKey(email));

	return `/apps/provisioning_api/mailVerification/${key}/${encodeURIComponent(token)}/${encodeURIComponent(userId)}`;
}

describe('parity: provisioning mail-verify', () => {
	beforeEach(async () => {
		await resetParityProvisioningStores();
	});

	afterEach(async () => {
		await resetParityProvisioningStores();
	});

	it('GET mailVerification unauthenticated JSON returns 401 (provisioning_api.Verification#showVerifyMail)', async () => {
		const result = await runParityCase({
			name: 'provisioning-mail-verify-get-unauth-json',
			path: mailVerifyPath('admin', 'admin@parity.test', 'unused-token'),
			options: {
				headers: JSON_HEADERS,
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET mailVerification unauthenticated HTML returns 303 login (provisioning_api.Verification#showVerifyMail)', async () => {
		const result = await runParityCase({
			name: 'provisioning-mail-verify-get-unauth-html',
			path: mailVerifyPath('admin', 'admin@parity.test', 'unused-token'),
			options: {
				headers: HTML_HEADERS,
			},
			compare: {
				contractHeaders: ['content-type', 'location'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET mailVerification wrong owner returns 200 guest error (provisioning_api.Verification#showVerifyMail)', async () => {
		const env = getParityEnv();
		const jar = await loginParitySession(env.newBaseUrl);
		await seedParityMailVerification('alice', 'alice@parity.test');
		const path = mailVerifyPath('alice', 'alice@parity.test', 'unused-token');

		const result = await runParityCase({
			name: 'provisioning-mail-verify-get-wrong-owner',
			path,
			options: {
				headers: {
					...HTML_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: HTML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const response = await fetch(`${env.newBaseUrl}${path}`, {
			headers: {
				...HTML_HEADERS,
				cookie: cookieJarToHeader(jar) ?? '',
			},
		});

		expect(response.status).toBe(200);
		expect(await response.text()).toContain('data-template="core-error"');
	});

	it('GET mailVerification decrypt failure returns 200 guest error (provisioning_api.Verification#showVerifyMail)', async () => {
		const env = getParityEnv();
		const jar = await loginParitySession(env.newBaseUrl);
		const path = `/apps/provisioning_api/mailVerification/${encodeURIComponent('invalid-key')}/${encodeURIComponent('unused-token')}/${encodeURIComponent('admin')}`;

		const result = await runParityCase({
			name: 'provisioning-mail-verify-get-decrypt-fail',
			path,
			options: {
				headers: {
					...HTML_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: HTML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const response = await fetch(`${env.newBaseUrl}${path}`, {
			headers: {
				...HTML_HEADERS,
				cookie: cookieJarToHeader(jar) ?? '',
			},
		});

		expect(response.status).toBe(200);
		expect(await response.text()).toContain('data-template="core-error"');
	});

	it('GET mailVerification success returns 200 guest confirmation (provisioning_api.Verification#showVerifyMail)', async () => {
		const env = getParityEnv();
		const jar = await loginParitySession(env.newBaseUrl);
		const seeded = await seedParityMailVerification('admin', 'admin@parity.test');
		const path = mailVerifyPath('admin', 'admin@parity.test', seeded.token);

		const result = await runParityCase({
			name: 'provisioning-mail-verify-get-happy',
			path,
			options: {
				headers: {
					...HTML_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: HTML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const response = await fetch(`${env.newBaseUrl}${path}`, {
			headers: {
				...HTML_HEADERS,
				cookie: cookieJarToHeader(jar) ?? '',
			},
		});

		expect(response.status).toBe(200);
		expect(await response.text()).toContain('data-template="core-confirmation"');
	});

	it('POST mailVerification without CSRF returns 412 (provisioning_api.Verification#verifyMail.post)', async () => {
		const env = getParityEnv();
		const jar = await loginParitySession(env.newBaseUrl);
		const seeded = await seedParityMailVerification('admin', 'admin@parity.test');
		const path = mailVerifyPath('admin', 'admin@parity.test', seeded.token);

		const result = await runParityCase({
			name: 'provisioning-mail-verify-post-no-csrf',
			path,
			options: {
				method: 'POST',
				headers: {
					...HTML_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
					'content-type': 'application/x-www-form-urlencoded',
				},
				body: '',
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST mailVerification success returns 200 guest success (provisioning_api.Verification#verifyMail.post)', async () => {
		const env = getParityEnv();
		const session = await loginParitySessionWithCsrf(env.newBaseUrl);
		const seeded = await seedParityMailVerification('admin', 'admin@parity.test');
		const path = mailVerifyPath('admin', 'admin@parity.test', seeded.token);

		const result = await runParityCase({
			name: 'provisioning-mail-verify-post-happy',
			path,
			options: {
				method: 'POST',
				headers: {
					...HTML_HEADERS,
					cookie: cookieJarToHeader(session.jar) ?? '',
					'content-type': 'application/x-www-form-urlencoded',
				},
				body: new URLSearchParams({ requesttoken: session.csrfToken }).toString(),
			},
			compare: HTML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST mailVerification invalid token returns 200 error with throttle (provisioning_api.Verification#verifyMail.post)', async () => {
		const env = getParityEnv();
		const session = await loginParitySessionWithCsrf(env.newBaseUrl);
		const path = mailVerifyPath('admin', 'admin@parity.test', 'invalid-mail-token');

		const result = await runParityCase({
			name: 'provisioning-mail-verify-post-invalid-token',
			path,
			options: {
				method: 'POST',
				headers: {
					...HTML_HEADERS,
					cookie: cookieJarToHeader(session.jar) ?? '',
					'content-type': 'application/x-www-form-urlencoded',
				},
				body: new URLSearchParams({ requesttoken: session.csrfToken }).toString(),
			},
			compare: {
				contractHeaders: ['content-type', 'x-nextcloud-bruteforce-throttled'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST mailVerification expired token returns 200 error without throttle (provisioning_api.Verification#verifyMail.post)', async () => {
		const env = getParityEnv();
		const session = await loginParitySessionWithCsrf(env.newBaseUrl);
		const path = mailVerifyPath('admin', 'admin@parity.test', MAIL_VERIFY_EXPIRED_TOKEN);

		const result = await runParityCase({
			name: 'provisioning-mail-verify-post-expired-token',
			path,
			options: {
				method: 'POST',
				headers: {
					...HTML_HEADERS,
					cookie: cookieJarToHeader(session.jar) ?? '',
					'content-type': 'application/x-www-form-urlencoded',
				},
				body: new URLSearchParams({ requesttoken: session.csrfToken }).toString(),
			},
			compare: HTML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST mailVerification removed email returns 200 guest error (provisioning_api.Verification#verifyMail.post)', async () => {
		const env = getParityEnv();
		const session = await loginParitySessionWithCsrf(env.newBaseUrl);
		const email = 'admin@parity.test';
		const seeded = await seedParityMailVerification('admin', email);
		await removeParityProvisioningEmail('admin', email);
		const path = mailVerifyPath('admin', email, seeded.token);

		const result = await runParityCase({
			name: 'provisioning-mail-verify-post-email-removed',
			path,
			options: {
				method: 'POST',
				headers: {
					...HTML_HEADERS,
					cookie: cookieJarToHeader(session.jar) ?? '',
					'content-type': 'application/x-www-form-urlencoded',
				},
				body: new URLSearchParams({ requesttoken: session.csrfToken }).toString(),
			},
			compare: HTML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});
