import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getParityEnv } from '../env';
import { formatParityMismatches, runParityCase } from '../harness';
import { resetParityInvitationHtmlStores } from '../helpers/dav-invitation-html';

const JUNK_TOKEN = 'does-not-exist-invitation-token';

const HTML_COMPARE = {
	contractHeaders: ['content-type'],
};

const HTML_HEADERS = {
	Accept: 'text/html',
};

describe('parity: dav invitation-html', () => {
	beforeEach(async () => {
		await resetParityInvitationHtmlStores();
	});

	afterEach(async () => {
		await resetParityInvitationHtmlStores();
	});

	it('GET accept unauthenticated returns 200 HTML', async () => {
		const result = await runParityCase({
			name: 'dav-invitation_response-accept',
			path: `/apps/dav/invitation/accept/${JUNK_TOKEN}`,
			options: {
				headers: HTML_HEADERS,
			},
			compare: HTML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/apps/dav/invitation/accept/${JUNK_TOKEN}`, {
			headers: HTML_HEADERS,
		});

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('text/html; charset=UTF-8');
		expect(await response.text()).toContain('data-template="schedule-response-error"');
	});

	it('GET accept junk token returns 200 error template not 404', async () => {
		const result = await runParityCase({
			name: 'dav-invitation-accept-junk-token',
			path: `/apps/dav/invitation/accept/${JUNK_TOKEN}`,
			options: {
				headers: HTML_HEADERS,
			},
			compare: HTML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/apps/dav/invitation/accept/${JUNK_TOKEN}`, {
			headers: HTML_HEADERS,
		});

		expect(response.status).toBe(200);
		expect(await response.text()).toContain('data-template="schedule-response-error"');
	});

	it('GET options junk token returns 200 options template', async () => {
		const result = await runParityCase({
			name: 'dav-invitation_response-options',
			path: `/apps/dav/invitation/moreOptions/${JUNK_TOKEN}`,
			options: {
				headers: HTML_HEADERS,
			},
			compare: HTML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/apps/dav/invitation/moreOptions/${JUNK_TOKEN}`, {
			headers: HTML_HEADERS,
		});

		expect(response.status).toBe(200);
		expect(await response.text()).toContain('data-template="schedule-response-options"');
	});

	it('POST moreOptions without CSRF still returns 200 HTML', async () => {
		const result = await runParityCase({
			name: 'dav-invitation_response-processMoreOptions.post',
			path: `/apps/dav/invitation/moreOptions/${JUNK_TOKEN}`,
			options: {
				method: 'POST',
				headers: {
					...HTML_HEADERS,
					'content-type': 'application/x-www-form-urlencoded',
				},
				body: 'partStat=INVALID',
			},
			compare: HTML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/apps/dav/invitation/moreOptions/${JUNK_TOKEN}`, {
			method: 'POST',
			headers: {
				...HTML_HEADERS,
				'content-type': 'application/x-www-form-urlencoded',
			},
			body: 'partStat=INVALID',
		});

		expect(response.status).toBe(200);
		expect(await response.text()).toContain('data-template="schedule-response-error"');
	});
});
