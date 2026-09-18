import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetSessionStore } from '@/src/server/auth/session-store';
import { formatParityMismatches, runParityCase } from '../harness';
import { cookieJarToHeader } from '../helpers/cookies';
import { getParityEnv } from '../env';
import { fetchLegacyMockSnapshot } from '../legacy-mock/adapter';
import {
	enableSharingV1OnBothSides,
	resetParitySharingV1Stores,
	seedShareOnBothSides,
} from '../helpers/sharing-v1';
import {
	loginParitySession,
	OCS_JSON_HEADERS,
	OCS_META_PATHS,
	seedParitySessionFromJar,
} from '../helpers/session';

const UNKNOWN_SHARE_ID = 'unknown-share-id';

const OCS_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: OCS_META_PATHS,
};

const OCS_ERROR_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: [
		...OCS_META_PATHS,
		'ocs.data',
	],
};

const OCS_501_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: [
		...OCS_META_PATHS,
		'ocs.meta.message',
	],
};

function sourcePath(shareId: string): string {
	return `/ocs/v2.php/apps/sharing/api/v1/share/${shareId}/source?format=json`;
}

function recipientPath(shareId: string): string {
	return `/ocs/v2.php/apps/sharing/api/v1/share/${shareId}/recipient?format=json`;
}

function recipientSecretPath(shareId: string): string {
	return `/ocs/v2.php/apps/sharing/api/v1/share/${shareId}/recipient/secret?format=json`;
}

function recipientPermissionPath(shareId: string): string {
	return `/ocs/v2.php/apps/sharing/api/v1/share/${shareId}/recipient/permission?format=json`;
}

async function loginLegacyMockJar(): Promise<Record<string, string>> {
	const jar = await loginParitySession('http://127.0.0.1:3100');
	const csrfResponse = await fetch('http://127.0.0.1:3100/csrftoken', {
		headers: {
			cookie: cookieJarToHeader(jar) ?? '',
		},
	});
	const csrfBody = await csrfResponse.json() as { token: string };

	seedParitySessionFromJar(jar, csrfBody.token);

	return jar;
}

describe('parity: sharing-v1-sources-recipients', () => {
	beforeEach(async () => {
		await resetParitySharingV1Stores();
	});

	afterEach(async () => {
		resetSessionStore();
		await resetParitySharingV1Stores();
	});

	it('POST add-share-source unauthenticated returns 401/997 when API is off', async () => {
		const result = await runParityCase({
			name: 'add-share-source-unauth-api-off',
			path: sourcePath(UNKNOWN_SHARE_ID),
			options: {
				method: 'POST',
				headers: OCS_JSON_HEADERS,
				body: JSON.stringify({
					class: 'OCA\\Files\\Sharing\\Source\\NodeShareSourceType',
					value: '1',
				}),
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST add-share-source authenticated returns 501 when API is off', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'add-share-source-auth-api-off',
			path: sourcePath(UNKNOWN_SHARE_ID),
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({
					class: 'OCA\\Files\\Sharing\\Source\\NodeShareSourceType',
					value: '1',
				}),
			},
			compare: OCS_501_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST add-share-source unknown share returns 404', async () => {
		await enableSharingV1OnBothSides();
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'add-share-source-unknown',
			path: sourcePath(UNKNOWN_SHARE_ID),
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({
					class: 'OCA\\Files\\Sharing\\Source\\NodeShareSourceType',
					value: '1',
				}),
			},
			compare: OCS_ERROR_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST add-share-source missing required params returns raw 400 empty', async () => {
		await enableSharingV1OnBothSides();
		const jar = await loginParitySession();
		const shareId = await seedShareOnBothSides(jar);
		const legacyJar = await loginLegacyMockJar();
		const env = getParityEnv();

		const legacy = await fetchLegacyMockSnapshot(sourcePath(shareId), {
			method: 'POST',
			headers: {
				...OCS_JSON_HEADERS,
				cookie: cookieJarToHeader(legacyJar) ?? '',
			},
			body: JSON.stringify({}),
		});

		const response = await fetch(`${env.newBaseUrl}${sourcePath(shareId)}`, {
			method: 'POST',
			headers: {
				...OCS_JSON_HEADERS,
				cookie: cookieJarToHeader(jar) ?? '',
			},
			body: JSON.stringify({}),
		});

		expect(legacy.status).toBe(400);
		expect(response.status).toBe(400);
		expect(legacy.rawBody).toBe('');
		expect(await response.text()).toBe('');
	});

	it('DELETE remove-share-source via query unknown share returns 404', async () => {
		await enableSharingV1OnBothSides();
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'remove-share-source-unknown',
			path: `${sourcePath(UNKNOWN_SHARE_ID)}&class=OCA\\Files\\Sharing\\Source\\NodeShareSourceType&value=1`,
			options: {
				method: 'DELETE',
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: OCS_ERROR_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('DELETE remove-share-source missing query params returns raw 400 empty', async () => {
		await enableSharingV1OnBothSides();
		const jar = await loginParitySession();
		const shareId = await seedShareOnBothSides(jar);
		const legacyJar = await loginLegacyMockJar();
		const env = getParityEnv();

		const legacy = await fetchLegacyMockSnapshot(sourcePath(shareId), {
			method: 'DELETE',
			headers: {
				...OCS_JSON_HEADERS,
				cookie: cookieJarToHeader(legacyJar) ?? '',
			},
		});

		const response = await fetch(`${env.newBaseUrl}${sourcePath(shareId)}`, {
			method: 'DELETE',
			headers: {
				...OCS_JSON_HEADERS,
				cookie: cookieJarToHeader(jar) ?? '',
			},
		});

		expect(legacy.status).toBe(400);
		expect(response.status).toBe(400);
		expect(legacy.rawBody).toBe('');
		expect(await response.text()).toBe('');
	});

	it('POST add-share-recipient unauthenticated returns 401/997 when API is on', async () => {
		await enableSharingV1OnBothSides();

		const result = await runParityCase({
			name: 'add-share-recipient-unauth-api-on',
			path: recipientPath(UNKNOWN_SHARE_ID),
			options: {
				method: 'POST',
				headers: OCS_JSON_HEADERS,
				body: JSON.stringify({
					class: 'OC\\Core\\Sharing\\Recipient\\UserShareRecipientType',
					value: 'alice',
				}),
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST add-share-recipient unknown share returns 404', async () => {
		await enableSharingV1OnBothSides();
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'add-share-recipient-unknown',
			path: recipientPath(UNKNOWN_SHARE_ID),
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({
					class: 'OC\\Core\\Sharing\\Recipient\\UserShareRecipientType',
					value: 'alice',
				}),
			},
			compare: OCS_ERROR_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('DELETE remove-share-recipient via query unknown share returns 404', async () => {
		await enableSharingV1OnBothSides();
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'remove-share-recipient-unknown',
			path: `${recipientPath(UNKNOWN_SHARE_ID)}&class=OC\\Core\\Sharing\\Recipient\\UserShareRecipientType&value=alice`,
			options: {
				method: 'DELETE',
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: OCS_ERROR_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PUT update-share-recipient-secret unknown share returns 404', async () => {
		await enableSharingV1OnBothSides();
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'update-share-recipient-secret-unknown',
			path: recipientSecretPath(UNKNOWN_SHARE_ID),
			options: {
				method: 'PUT',
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({
					class: 'OC\\Core\\Sharing\\Recipient\\TokenShareRecipientType',
					value: 'token-value',
					secret: 'updated-secret',
				}),
			},
			compare: OCS_ERROR_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PUT update-share-recipient-secret missing secret returns raw 400 empty', async () => {
		await enableSharingV1OnBothSides();
		const jar = await loginParitySession();
		const shareId = await seedShareOnBothSides(jar);
		const legacyJar = await loginLegacyMockJar();
		const env = getParityEnv();

		const legacy = await fetchLegacyMockSnapshot(recipientSecretPath(shareId), {
			method: 'PUT',
			headers: {
				...OCS_JSON_HEADERS,
				cookie: cookieJarToHeader(legacyJar) ?? '',
			},
			body: JSON.stringify({
				class: 'OC\\Core\\Sharing\\Recipient\\TokenShareRecipientType',
				value: 'token-value',
			}),
		});

		const response = await fetch(`${env.newBaseUrl}${recipientSecretPath(shareId)}`, {
			method: 'PUT',
			headers: {
				...OCS_JSON_HEADERS,
				cookie: cookieJarToHeader(jar) ?? '',
			},
			body: JSON.stringify({
				class: 'OC\\Core\\Sharing\\Recipient\\TokenShareRecipientType',
				value: 'token-value',
			}),
		});

		expect(legacy.status).toBe(400);
		expect(response.status).toBe(400);
		expect(legacy.rawBody).toBe('');
		expect(await response.text()).toBe('');
	});

	it('PUT update-share-recipient-permission unknown share returns 404', async () => {
		await enableSharingV1OnBothSides();
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'update-share-recipient-permission-unknown',
			path: recipientPermissionPath(UNKNOWN_SHARE_ID),
			options: {
				method: 'PUT',
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({
					recipientClass: 'OC\\Core\\Sharing\\Recipient\\UserShareRecipientType',
					recipientValue: 'alice',
					permissionClass: 'OC\\Core\\Sharing\\Permission\\ReshareSharePermissionType',
					enabled: true,
				}),
			},
			compare: OCS_ERROR_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PUT update-share-recipient-permission missing enabled returns raw 400 empty', async () => {
		await enableSharingV1OnBothSides();
		const jar = await loginParitySession();
		const shareId = await seedShareOnBothSides(jar);
		const legacyJar = await loginLegacyMockJar();
		const env = getParityEnv();

		const legacy = await fetchLegacyMockSnapshot(recipientPermissionPath(shareId), {
			method: 'PUT',
			headers: {
				...OCS_JSON_HEADERS,
				cookie: cookieJarToHeader(legacyJar) ?? '',
			},
			body: JSON.stringify({
				recipientClass: 'OC\\Core\\Sharing\\Recipient\\UserShareRecipientType',
				recipientValue: 'alice',
				permissionClass: 'OC\\Core\\Sharing\\Permission\\ReshareSharePermissionType',
			}),
		});

		const response = await fetch(`${env.newBaseUrl}${recipientPermissionPath(shareId)}`, {
			method: 'PUT',
			headers: {
				...OCS_JSON_HEADERS,
				cookie: cookieJarToHeader(jar) ?? '',
			},
			body: JSON.stringify({
				recipientClass: 'OC\\Core\\Sharing\\Recipient\\UserShareRecipientType',
				recipientValue: 'alice',
				permissionClass: 'OC\\Core\\Sharing\\Permission\\ReshareSharePermissionType',
			}),
		});

		expect(legacy.status).toBe(400);
		expect(response.status).toBe(400);
		expect(legacy.rawBody).toBe('');
		expect(await response.text()).toBe('');
	});
});
