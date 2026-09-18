import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetSessionStore } from '@/src/server/auth/session-store';
import { resetDavFileStore } from '@/src/server/dav/store';
import {
	SHARE_STATUS_PENDING,
	SHARE_TYPE_USER,
} from '@/src/server/files_sharing/constants';
import { setIncomingServer2ServerShareEnabled } from '@/src/server/files_sharing/config';
import { formatParityMismatches, runParityCase } from '../harness';
import { cookieJarToHeader } from '../helpers/cookies';
import { resetParityFilesStores } from '../helpers/files';
import { resetParityShareStores, seedExternalShareOnBothSides } from '../helpers/files-sharing';
import { getParityEnv } from '../env';
import { getFilenamesSessionId, seedNonAdminSession } from '../legacy-mock/files-filenames';
import {
	basicAuthHeader,
	loginParitySessionWithCsrf,
	OCS_JSON_HEADERS,
} from '../helpers/session';

const EXTERNAL_SHARES_PATH = '/apps/files_sharing/api/externalShares';
const PARITY_PASSWORD = 'parity-test-password';

const JSON_COMPARE = {
	contractHeaders: ['content-type'],
};

const STATUS_COMPARE = {
	contractHeaders: ['content-type'],
};

async function resetExternalSharesStores(): Promise<void> {
	resetDavFileStore();
	await resetParityFilesStores();
	await resetParityShareStores();
}

async function setIncomingS2SOnBothSides(enabled: boolean): Promise<void> {
	setIncomingServer2ServerShareEnabled(enabled);

	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/api/parity/set-files-sharing-config`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
		},
		body: JSON.stringify({ incomingServer2ServerShareEnabled: enabled }),
	});

	if (!response.ok) {
		throw new Error(`Failed to set files_sharing config (${response.status})`);
	}
}

function aliceAuthHeaders(jar: Record<string, string>, options: { csrfToken?: string } = {}): Record<string, string> {
	const headers: Record<string, string> = {
		cookie: cookieJarToHeader(jar) ?? '',
		...basicAuthHeader('alice', PARITY_PASSWORD),
		...OCS_JSON_HEADERS,
	};

	if (options.csrfToken) {
		headers.requesttoken = options.csrfToken;
	}

	return headers;
}

function seedAliceMockSession(jar: Record<string, string>): void {
	const sessionId = getFilenamesSessionId({ headers: { cookie: cookieJarToHeader(jar) ?? '' } });

	if (sessionId) {
		seedNonAdminSession(sessionId, 'alice');
	}
}

async function seedPendingExternalShareForAlice(): Promise<void> {
	await seedExternalShareOnBothSides({
		id: '1',
		parent: '-1',
		shareType: SHARE_TYPE_USER,
		remote: 'https://remote.example.com',
		remoteId: 'remote-share-1',
		refreshToken: 'parity-remote-token',
		password: null,
		accessToken: null,
		accessTokenExpires: null,
		name: '/welcome.txt',
		owner: 'remote-owner',
		user: 'alice',
		mountpoint: '{{TemporaryMountPointName#/welcome.txt}}',
		accepted: SHARE_STATUS_PENDING,
	});
}

describe('parity: files-sharing-external-shares', () => {
	beforeEach(async () => {
		resetSessionStore();
		await resetExternalSharesStores();
		await setIncomingS2SOnBothSides(true);
	});

	afterEach(async () => {
		resetSessionStore();
		await resetExternalSharesStores();
		await setIncomingS2SOnBothSides(true);
	});

	it('GET externalShares requires auth (401 JSON)', async () => {
		const result = await runParityCase({
			name: 'external-shares-get-unauth',
			path: EXTERNAL_SHARES_PATH,
			options: {
				headers: {
					Accept: 'application/json',
				},
			},
			compare: JSON_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET externalShares without CSRF returns 412', async () => {
		const { jar } = await loginParitySessionWithCsrf();
		seedAliceMockSession(jar);

		const result = await runParityCase({
			name: 'external-shares-get-missing-csrf',
			path: EXTERNAL_SHARES_PATH,
			options: {
				headers: {
					Accept: 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
					...basicAuthHeader('alice', PARITY_PASSWORD),
				},
			},
			compare: JSON_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET externalShares with incoming S2S off returns 405', async () => {
		await setIncomingS2SOnBothSides(false);
		const { jar, csrfToken } = await loginParitySessionWithCsrf();
		seedAliceMockSession(jar);

		const result = await runParityCase({
			name: 'external-shares-incoming-s2s-off',
			path: EXTERNAL_SHARES_PATH,
			options: {
				headers: aliceAuthHeaders(jar, { csrfToken }),
			},
			compare: JSON_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET externalShares lists pending shares with parent -1 string', async () => {
		await seedPendingExternalShareForAlice();
		const { jar, csrfToken } = await loginParitySessionWithCsrf();
		seedAliceMockSession(jar);

		const result = await runParityCase({
			name: 'external-shares-index-pending',
			path: EXTERNAL_SHARES_PATH,
			options: {
				headers: aliceAuthHeaders(jar, { csrfToken }),
			},
			compare: JSON_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST externalShares with unknown id returns 200 empty array', async () => {
		const { jar, csrfToken } = await loginParitySessionWithCsrf();
		seedAliceMockSession(jar);

		const result = await runParityCase({
			name: 'external-shares-create-unknown-id',
			path: EXTERNAL_SHARES_PATH,
			options: {
				method: 'POST',
				headers: {
					...aliceAuthHeaders(jar, { csrfToken }),
					'content-type': 'application/json',
				},
				body: JSON.stringify({ id: '999999' }),
			},
			compare: JSON_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('DELETE externalShares with unknown id returns 200 empty array', async () => {
		const { jar, csrfToken } = await loginParitySessionWithCsrf();
		seedAliceMockSession(jar);

		const result = await runParityCase({
			name: 'external-shares-destroy-unknown-id',
			path: `${EXTERNAL_SHARES_PATH}/999999`,
			options: {
				method: 'DELETE',
				headers: aliceAuthHeaders(jar, { csrfToken }),
			},
			compare: JSON_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET externalShares/{id} returns 500 (no controller method)', async () => {
		const { jar, csrfToken } = await loginParitySessionWithCsrf();
		seedAliceMockSession(jar);

		const result = await runParityCase({
			name: 'external-shares-show-missing-method',
			path: `${EXTERNAL_SHARES_PATH}/1`,
			options: {
				headers: aliceAuthHeaders(jar, { csrfToken }),
			},
			compare: STATUS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PUT externalShares/{id} returns 500 (no controller method)', async () => {
		const { jar, csrfToken } = await loginParitySessionWithCsrf();
		seedAliceMockSession(jar);

		const result = await runParityCase({
			name: 'external-shares-update-missing-method',
			path: `${EXTERNAL_SHARES_PATH}/1`,
			options: {
				method: 'PUT',
				headers: {
					...aliceAuthHeaders(jar, { csrfToken }),
					'content-type': 'application/json',
				},
				body: JSON.stringify({}),
			},
			compare: STATUS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});
