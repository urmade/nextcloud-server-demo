import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetSessionStore } from '@/src/server/auth/session-store';
import { formatParityMismatches, runParityCase } from '../harness';
import { cookieJarToHeader } from '../helpers/cookies';
import {
	enableSharingV1OnBothSides,
	resetParitySharingV1Stores,
	seedShareOnBothSides,
} from '../helpers/sharing-v1';
import {
	loginParitySession,
	OCS_JSON_HEADERS,
	OCS_META_PATHS,
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

function statePath(shareId: string): string {
	return `/ocs/v2.php/apps/sharing/api/v1/share/${shareId}/state?format=json`;
}

function userStatusPath(shareId: string): string {
	return `/ocs/v2.php/apps/sharing/api/v1/share/${shareId}/user-status?format=json`;
}

function propertyPath(shareId: string): string {
	return `/ocs/v2.php/apps/sharing/api/v1/share/${shareId}/property?format=json`;
}

function permissionPath(shareId: string): string {
	return `/ocs/v2.php/apps/sharing/api/v1/share/${shareId}/permission?format=json`;
}

function permissionPresetPath(shareId: string): string {
	return `/ocs/v2.php/apps/sharing/api/v1/share/${shareId}/permission/preset?format=json`;
}

describe('parity: sharing-v1-share-attrs', () => {
	beforeEach(async () => {
		await resetParitySharingV1Stores();
	});

	afterEach(async () => {
		resetSessionStore();
		await resetParitySharingV1Stores();
	});

	it('PUT update-share-state unauthenticated returns 401/997 when API is off', async () => {
		const result = await runParityCase({
			name: 'update-share-state-unauth-api-off',
			path: statePath(UNKNOWN_SHARE_ID),
			options: {
				method: 'PUT',
				headers: OCS_JSON_HEADERS,
				body: JSON.stringify({ state: 'draft' }),
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PUT update-share-state authenticated returns 501 when API is off', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'update-share-state-auth-api-off',
			path: statePath(UNKNOWN_SHARE_ID),
			options: {
				method: 'PUT',
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({ state: 'draft' }),
			},
			compare: OCS_501_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PUT update-share-state unknown share returns 404', async () => {
		await enableSharingV1OnBothSides();
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'update-share-state-unknown',
			path: statePath(UNKNOWN_SHARE_ID),
			options: {
				method: 'PUT',
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({ state: 'draft' }),
			},
			compare: OCS_ERROR_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PUT update-share-state invalid enum returns 400 enum message', async () => {
		await enableSharingV1OnBothSides();
		const jar = await loginParitySession();
		const shareId = await seedShareOnBothSides(jar);

		const result = await runParityCase({
			name: 'update-share-state-invalid-enum',
			path: statePath(shareId),
			options: {
				method: 'PUT',
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({ state: 'nope' }),
			},
			compare: OCS_ERROR_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PUT update-share-user-status unknown share returns 404', async () => {
		await enableSharingV1OnBothSides();
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'update-share-user-status-unknown',
			path: userStatusPath(UNKNOWN_SHARE_ID),
			options: {
				method: 'PUT',
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({ userStatus: 'pending' }),
			},
			compare: OCS_ERROR_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PUT update-share-property unknown share returns 404', async () => {
		await enableSharingV1OnBothSides();
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'update-share-property-unknown',
			path: propertyPath(UNKNOWN_SHARE_ID),
			options: {
				method: 'PUT',
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({
					class: 'OC\\Core\\Sharing\\Property\\StringSharePropertyType',
					value: 'note',
				}),
			},
			compare: OCS_ERROR_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PUT update-share-permission unknown share returns 404', async () => {
		await enableSharingV1OnBothSides();
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'update-share-permission-unknown',
			path: permissionPath(UNKNOWN_SHARE_ID),
			options: {
				method: 'PUT',
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({
					class: 'OC\\Core\\Sharing\\Permission\\ReshareSharePermissionType',
					enabled: true,
				}),
			},
			compare: OCS_ERROR_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PUT select-share-permission-preset unknown share returns 404', async () => {
		await enableSharingV1OnBothSides();
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'select-share-permission-preset-unknown',
			path: permissionPresetPath(UNKNOWN_SHARE_ID),
			options: {
				method: 'PUT',
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({
					permissionPresetClass: 'OC\\Core\\Sharing\\Permission\\Preset\\ReadOnlySharePermissionPreset',
				}),
			},
			compare: OCS_ERROR_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});
