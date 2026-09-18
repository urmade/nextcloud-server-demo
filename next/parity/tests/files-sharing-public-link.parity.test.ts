import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from '@/src/server/auth/cookies';
import { resetSessionStore } from '@/src/server/auth/session-store';
import { formatParityMismatches, runParityCase } from '../harness';
import { compareBinarySnapshots, snapshotBinaryResponse } from '../helpers/binary';
import { cookieJarToHeader, mergeResponseCookies } from '../helpers/cookies';
import { resetParityFilesStores } from '../helpers/files';
import { resetParityShareStores } from '../helpers/files-sharing';
import { getParityEnv } from '../env';
import {
	fetchParityGuestCsrfToken,
	loginParitySession,
	OCS_JSON_HEADERS,
} from '../helpers/session';

const SHARES_PATH = '/ocs/v2.php/apps/files_sharing/api/v1/shares?format=json';

const HTML_COMPARE = {
	contractHeaders: ['content-type'],
};

const REDIRECT_COMPARE = {
	contractHeaders: ['location'],
	ignoreHeaders: ['location'],
};

const JSON_COMPARE = {
	contractHeaders: ['content-type'],
};

function normalizeLocation(location: string | null | undefined): string | null {
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

async function createLinkShare(
	jar: Record<string, string>,
	options: { path: string; password?: string },
): Promise<string> {
	const result = await runParityCase({
		name: 'seed-link-share',
		path: SHARES_PATH,
		options: {
			method: 'POST',
			headers: {
				...OCS_JSON_HEADERS,
				'content-type': 'application/json',
				cookie: cookieJarToHeader(jar) ?? '',
			},
			body: JSON.stringify({
				path: options.path,
				shareType: 3,
				password: options.password,
			}),
		},
		compare: {
			contractHeaders: ['content-type'],
			includeBodyPaths: ['ocs.meta.status', 'ocs.meta.statuscode', 'ocs.data.token'],
			unstableIdPaths: ['ocs.data.token', 'ocs.data.url', 'ocs.data.id'],
		},
	});

	expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/ocs/v2.php/apps/files_sharing/api/v1/shares/1?format=json`, {
		headers: {
			...OCS_JSON_HEADERS,
			cookie: cookieJarToHeader(jar) ?? '',
		},
	});
	const body = await response.json() as { ocs: { data: Array<{ token: string }> } };
	const token = body.ocs.data[0]?.token;

	expect(typeof token, `seeded link share has no token: ${JSON.stringify(body)}`).toBe('string');

	return token;
}

describe('parity: files-sharing-public-link', () => {
	beforeEach(async () => {
		await resetParityFilesStores();
		await resetParityShareStores();
	});

	afterEach(async () => {
		resetSessionStore();
		await resetParityFilesStores();
		await resetParityShareStores();
	});

	it('GET /s/{token} returns 200 HTML for a valid link share', async () => {
		const jar = await loginParitySession();
		const token = await createLinkShare(jar, { path: '/welcome.txt' });

		const result = await runParityCase({
			name: 'show-share-happy',
			path: `/s/${token}`,
			options: {
				headers: {
					Accept: 'text/html',
				},
			},
			compare: HTML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/s/${token}`, {
			redirect: 'manual',
			headers: {
				Accept: 'text/html',
			},
		});

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('text/html; charset=UTF-8');
		expect(await response.text()).toContain(`data-share-token="${token}"`);
	});

	it('GET /s/{token} returns 404 guest HTML for unknown token', async () => {
		const result = await runParityCase({
			name: 'show-share-unknown-token',
			path: '/s/does-not-exist-token',
			options: {
				headers: {
					Accept: 'text/html',
				},
			},
			compare: HTML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/s/does-not-exist-token`, {
			redirect: 'manual',
			headers: {
				Accept: 'text/html',
			},
		});

		expect(response.status).toBe(404);
		expect(response.headers.get('content-type')).toBe('text/html; charset=UTF-8');
		expect(await response.text()).toContain('class="guest"');
	});

	it('GET password-protected share redirects 303 to authenticate', async () => {
		const jar = await loginParitySession();
		const token = await createLinkShare(jar, { path: '/welcome.txt', password: 'secret' });

		const result = await runParityCase({
			name: 'show-share-password-redirect',
			path: `/s/${token}`,
			options: {
				headers: {
					Accept: 'text/html',
				},
			},
			compare: REDIRECT_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/s/${token}`, {
			redirect: 'manual',
			headers: {
				Accept: 'text/html',
			},
		});

		expect(response.status).toBe(303);
		expect(normalizeLocation(response.headers.get('location'))).toBe(`/s/${token}/authenticate/showShare`);
	});

	it('POST authenticate without CSRF returns 412', async () => {
		const jar = await loginParitySession();
		const token = await createLinkShare(jar, { path: '/welcome.txt', password: 'secret' });

		const result = await runParityCase({
			name: 'authenticate-missing-csrf',
			path: `/s/${token}/authenticate/showShare`,
			options: {
				method: 'POST',
				headers: {
					'content-type': 'application/x-www-form-urlencoded',
				},
				body: new URLSearchParams({
					password: 'secret',
					passwordRequest: 'no',
				}).toString(),
			},
			compare: JSON_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/s/${token}/authenticate/showShare`, {
			method: 'POST',
			redirect: 'manual',
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
			},
			body: new URLSearchParams({
				password: 'secret',
				passwordRequest: 'no',
			}).toString(),
		});

		expect(response.status).toBe(412);
	});

	it('POST authenticate with wrong password returns 200 wrongpw HTML', async () => {
		const jar = await loginParitySession();
		const token = await createLinkShare(jar, { path: '/welcome.txt', password: 'secret' });
		const csrf = await fetchParityGuestCsrfToken();

		const result = await runParityCase({
			name: 'authenticate-wrong-password',
			path: `/s/${token}/authenticate/showShare`,
			options: {
				method: 'POST',
				headers: {
					'content-type': 'application/x-www-form-urlencoded',
					cookie: cookieJarToHeader(csrf.jar) ?? '',
					requesttoken: csrf.token,
				},
				body: new URLSearchParams({
					password: 'wrong-password',
					passwordRequest: 'no',
				}).toString(),
			},
			compare: HTML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/s/${token}/authenticate/showShare`, {
			method: 'POST',
			redirect: 'manual',
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				cookie: cookieJarToHeader(csrf.jar) ?? '',
				requesttoken: csrf.token,
			},
			body: new URLSearchParams({
				password: 'wrong-password',
				passwordRequest: 'no',
			}).toString(),
		});

		expect(response.status).toBe(200);
		expect(await response.text()).toContain('data-wrongpw="true"');
	});

	it('POST authenticate with the correct password unlocks showShare for the guest session', async () => {
		const jar = await loginParitySession();
		const token = await createLinkShare(jar, { path: '/welcome.txt', password: 'secret' });
		const csrf = await fetchParityGuestCsrfToken();

		const result = await runParityCase({
			name: 'authenticate-correct-password',
			path: `/s/${token}/authenticate/showShare`,
			options: {
				method: 'POST',
				headers: {
					'content-type': 'application/x-www-form-urlencoded',
					cookie: cookieJarToHeader(csrf.jar) ?? '',
					requesttoken: csrf.token,
				},
				body: new URLSearchParams({
					password: 'secret',
					passwordRequest: 'no',
				}).toString(),
			},
			compare: {
				...REDIRECT_COMPARE,
				// The regenerated session id differs per process.
				ignoreHeaders: ['location', 'set-cookie'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		// A successful authenticate regenerates the session id, so the parity
		// case above already retired csrf.jar. Use a fresh guest session here.
		const env = getParityEnv();
		const roundTrip = await fetchParityGuestCsrfToken();
		const authResponse = await fetch(`${env.newBaseUrl}/s/${token}/authenticate/showShare`, {
			method: 'POST',
			redirect: 'manual',
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				cookie: cookieJarToHeader(roundTrip.jar) ?? '',
				requesttoken: roundTrip.token,
			},
			body: new URLSearchParams({
				password: 'secret',
				passwordRequest: 'no',
			}).toString(),
		});

		expect(authResponse.status).toBe(303);
		expect(normalizeLocation(authResponse.headers.get('location'))).toBe(`/s/${token}`);

		const authenticatedJar = mergeResponseCookies(roundTrip.jar, authResponse);

		expect(authenticatedJar[SESSION_COOKIE]).not.toBe(roundTrip.jar[SESSION_COOKIE]);

		const showResponse = await fetch(`${env.newBaseUrl}/s/${token}`, {
			redirect: 'manual',
			headers: {
				Accept: 'text/html',
				cookie: cookieJarToHeader(authenticatedJar) ?? '',
			},
		});

		expect(showResponse.status).toBe(200);
		expect(showResponse.headers.get('content-type')).toBe('text/html; charset=UTF-8');
		expect(await showResponse.text()).toContain(`data-share-token="${token}"`);

		const staleResponse = await fetch(`${env.newBaseUrl}/s/${token}`, {
			redirect: 'manual',
			headers: {
				Accept: 'text/html',
				cookie: cookieJarToHeader(roundTrip.jar) ?? '',
			},
		});

		expect(staleResponse.status).toBe(303);
	});

	it('GET downloadShare redirects 303 to public DAV path', async () => {
		const jar = await loginParitySession();
		const token = await createLinkShare(jar, { path: '/welcome.txt' });

		const result = await runParityCase({
			name: 'download-share-redirect',
			path: `/s/${token}/download/`,
			compare: REDIRECT_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/s/${token}/download/`, {
			redirect: 'manual',
		});

		expect(response.status).toBe(303);
		expect(normalizeLocation(response.headers.get('location'))).toBe(`/public.php/dav/files/${token}`);
	});

	it('GET directLink on password share without public session returns 404 HTML or 403 JSON', async () => {
		const jar = await loginParitySession();
		const token = await createLinkShare(jar, { path: '/welcome.txt', password: 'secret' });

		const result = await runParityCase({
			name: 'direct-link-password-unauth',
			path: `/s/${token}/preview`,
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/s/${token}/preview`, {
			redirect: 'manual',
		});

		expect([403, 404]).toContain(response.status);
	});

	it('GET directLink on folder share returns 400 JSON', async () => {
		const jar = await loginParitySession();
		const token = await createLinkShare(jar, { path: '/Documents' });

		const result = await runParityCase({
			name: 'direct-link-folder',
			path: `/s/${token}/preview`,
			compare: JSON_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/s/${token}/preview`, {
			redirect: 'manual',
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual([]);
	});

	it('GET /index.php/s/{token}/preview matches /s/{token}/preview for file share', async () => {
		const jar = await loginParitySession();
		const token = await createLinkShare(jar, { path: '/welcome.txt' });
		const env = getParityEnv();

		const [legacyResponse, newResponse] = await Promise.all([
			fetch(`${env.legacyUsesMock ? env.newBaseUrl : env.legacyBaseUrl}/index.php/s/${token}/preview`, {
				redirect: 'manual',
			}),
			fetch(`${env.newBaseUrl}/index.php/s/${token}/preview`, {
				redirect: 'manual',
			}),
		]);

		const [legacySnapshot, newSnapshot] = await Promise.all([
			snapshotBinaryResponse(legacyResponse),
			snapshotBinaryResponse(newResponse),
		]);

		const mismatches = compareBinarySnapshots(
			legacySnapshot,
			newSnapshot,
			['cache-control'],
			Object.fromEntries(legacyResponse.headers.entries()),
			Object.fromEntries(newResponse.headers.entries()),
		);

		expect(mismatches, mismatches.map((m) => m.message).join('\n')).toEqual([]);
		expect(newResponse.status).toBe(200);
		expect(newResponse.headers.get('content-type')).toBe('image/png');
	});

	it('owner session does not bypass password-protected showShare', async () => {
		const jar = await loginParitySession();
		const token = await createLinkShare(jar, { path: '/welcome.txt', password: 'secret' });

		const result = await runParityCase({
			name: 'show-share-owner-cookie-not-auth',
			path: `/s/${token}`,
			options: {
				headers: {
					Accept: 'text/html',
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: REDIRECT_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/s/${token}`, {
			redirect: 'manual',
			headers: {
				Accept: 'text/html',
				cookie: cookieJarToHeader(jar) ?? '',
			},
		});

		expect(response.status).toBe(303);
		expect(normalizeLocation(response.headers.get('location'))).toBe(`/s/${token}/authenticate/showShare`);
	});
});
