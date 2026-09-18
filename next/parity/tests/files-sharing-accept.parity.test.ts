import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetSessionStore } from '@/src/server/auth/session-store';
import { resetDavFileStore } from '@/src/server/dav/store';
import { formatParityMismatches, runParityCase } from '../harness';
import { cookieJarToHeader } from '../helpers/cookies';
import { resetParityFilesStores } from '../helpers/files';
import { resetParityShareStores } from '../helpers/files-sharing';
import { getFilenamesSessionId, seedNonAdminSession } from '../legacy-mock/files-filenames';
import {
	basicAuthHeader,
	loginParitySession,
	loginParitySessionWithCsrf,
	OCS_JSON_HEADERS,
} from '../helpers/session';

const ACCEPT_PATH = '/apps/files_sharing/accept/ocinternal:1';
const SHARES_PATH = '/ocs/v2.php/apps/files_sharing/api/v1/shares?format=json';
const PARITY_PASSWORD = 'parity-test-password';

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

async function resetAcceptStores(): Promise<void> {
	resetDavFileStore();
	await resetParityFilesStores();
	await resetParityShareStores();
}

async function seedPendingUserShareForAlice(adminJar: Record<string, string>): Promise<void> {
	const result = await runParityCase({
		name: 'seed-user-share-for-alice',
		path: SHARES_PATH,
		options: {
			method: 'POST',
			headers: {
				...OCS_JSON_HEADERS,
				'content-type': 'application/json',
				cookie: cookieJarToHeader(adminJar) ?? '',
			},
			body: JSON.stringify({
				path: '/welcome.txt',
				shareType: 0,
				shareWith: 'alice',
			}),
		},
		compare: JSON_COMPARE,
	});

	expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
}

function seedAliceMockSession(jar: Record<string, string>): void {
	const sessionId = getFilenamesSessionId({ headers: { cookie: cookieJarToHeader(jar) ?? '' } });

	if (sessionId) {
		seedNonAdminSession(sessionId, 'alice');
	}
}

function aliceAcceptHeaders(
	jar: Record<string, string>,
	options: { accept?: string; csrfToken?: string } = {},
): Record<string, string> {
	const headers: Record<string, string> = {
		Accept: options.accept ?? 'text/html',
		cookie: cookieJarToHeader(jar) ?? '',
		...basicAuthHeader('alice', PARITY_PASSWORD),
	};

	if (options.csrfToken) {
		headers.requesttoken = options.csrfToken;
	}

	return headers;
}

describe('parity: files-sharing-accept', () => {
	beforeEach(async () => {
		resetSessionStore();
		await resetAcceptStores();
	});

	afterEach(async () => {
		resetSessionStore();
		await resetAcceptStores();
	});

	it('GET accept requires auth (JSON 401)', async () => {
		const result = await runParityCase({
			name: 'accept-get-unauth-json',
			path: ACCEPT_PATH,
			options: {
				headers: {
					Accept: 'application/json',
				},
			},
			compare: JSON_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET accept redirects unauthenticated HTML to login (303)', async () => {
		const result = await runParityCase({
			name: 'accept-get-unauth-html',
			path: ACCEPT_PATH,
			options: {
				headers: {
					Accept: 'text/html',
				},
			},
			compare: REDIRECT_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET unknown share returns 404 HTML for logged-in recipient context', async () => {
		const adminJar = await loginParitySession();
		await seedPendingUserShareForAlice(adminJar);
		seedAliceMockSession(adminJar);

		const result = await runParityCase({
			name: 'accept-get-unknown-share',
			path: '/apps/files_sharing/accept/ocinternal:999999',
			options: {
				headers: aliceAcceptHeaders(adminJar),
			},
			compare: HTML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET accept shows pending share page for recipient', async () => {
		const adminJar = await loginParitySession();
		await seedPendingUserShareForAlice(adminJar);
		seedAliceMockSession(adminJar);

		const result = await runParityCase({
			name: 'accept-get-pending-share',
			path: ACCEPT_PATH,
			options: {
				headers: aliceAcceptHeaders(adminJar),
			},
			compare: HTML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST accept without CSRF returns 412', async () => {
		const { jar, csrfToken: _csrfToken } = await loginParitySessionWithCsrf();
		await seedPendingUserShareForAlice(jar);
		seedAliceMockSession(jar);

		const result = await runParityCase({
			name: 'accept-post-missing-csrf',
			path: ACCEPT_PATH,
			options: {
				method: 'POST',
				headers: aliceAcceptHeaders(jar, { accept: 'application/json' }),
			},
			compare: JSON_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST accept redirects to files view fileid (303)', async () => {
		const { jar, csrfToken } = await loginParitySessionWithCsrf();
		await seedPendingUserShareForAlice(jar);
		seedAliceMockSession(jar);

		const result = await runParityCase({
			name: 'accept-post-success',
			path: ACCEPT_PATH,
			options: {
				method: 'POST',
				headers: aliceAcceptHeaders(jar, { csrfToken }),
			},
			compare: REDIRECT_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});
