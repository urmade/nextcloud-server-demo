import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getParityEnv } from '../env';
import { formatParityMismatches, runParityCase } from '../harness';
import { cookieJarToHeader } from '../helpers/cookies';
import { resetParityOutOfOfficeStores } from '../helpers/dav-out-of-office';
import { loginParitySession, OCS_JSON_HEADERS, OCS_META_PATHS } from '../helpers/session';

const OOO_BASE = '/ocs/v2.php/apps/dav/api/v1/outOfOffice';
const VALID_BODY = {
	firstDay: '2020-01-01',
	lastDay: '2099-12-31',
	status: 'Away',
	message: 'On vacation',
};

function outOfOfficePath(userId: string, current = false): string {
	return `${OOO_BASE}/${encodeURIComponent(userId)}${current ? '/now' : ''}?format=json`;
}

async function setOutOfOfficeOnBothSides(
	jar: Record<string, string>,
	userId: string,
	body: Record<string, unknown> = VALID_BODY,
): Promise<void> {
	const env = getParityEnv();
	const options = {
		method: 'POST',
		headers: {
			...OCS_JSON_HEADERS,
			'content-type': 'application/json',
			cookie: cookieJarToHeader(jar) ?? '',
		},
		body: JSON.stringify(body),
	};

	const [legacyResult, newResponse] = await Promise.all([
		runParityCase({
			name: 'seed-legacy',
			path: outOfOfficePath(userId),
			options,
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		}),
		fetch(`${env.newBaseUrl}${outOfOfficePath(userId)}`, { ...options, redirect: 'manual' }),
	]);

	expect(legacyResult.mismatches, formatParityMismatches(legacyResult.mismatches)).toEqual([]);
	expect(newResponse.status).toBe(200);
}

describe('parity: dav out-of-office', () => {
	beforeEach(async () => {
		await resetParityOutOfOfficeStores();
	});

	afterEach(async () => {
		await resetParityOutOfOfficeStores();
	});

	it('POST set then GET configured returns 200 absence data', async () => {
		const jar = await loginParitySession();

		await setOutOfOfficeOnBothSides(jar, 'admin');

		const result = await runParityCase({
			name: 'dav-out-of-office-get-configured',
			path: outOfOfficePath('admin'),
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.id',
					'ocs.data.userId',
					'ocs.data.firstDay',
					'ocs.data.lastDay',
					'ocs.data.status',
					'ocs.data.message',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET current returns 200 when absence is in effect', async () => {
		const jar = await loginParitySession();

		await setOutOfOfficeOnBothSides(jar, 'admin');

		const result = await runParityCase({
			name: 'dav-out-of-office-get-current',
			path: outOfOfficePath('admin', true),
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.id',
					'ocs.data.userId',
					'ocs.data.startDate',
					'ocs.data.endDate',
					'ocs.data.shortMessage',
					'ocs.data.message',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('DELETE clear returns 200 null', async () => {
		const jar = await loginParitySession();

		await setOutOfOfficeOnBothSides(jar, 'admin');

		const result = await runParityCase({
			name: 'dav-out-of-office-clear',
			path: outOfOfficePath('admin'),
			options: {
				method: 'DELETE',
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET unauthenticated returns 401/997', async () => {
		const result = await runParityCase({
			name: 'dav-out-of-office-get-unauthenticated',
			path: outOfOfficePath('admin'),
			options: {
				headers: OCS_JSON_HEADERS,
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET other user without absence returns 404 null', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'dav-out-of-office-get-other-user-missing',
			path: outOfOfficePath('alice'),
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST with other uid path still writes session user', async () => {
		const jar = await loginParitySession();

		const setResult = await runParityCase({
			name: 'dav-out-of-office-set-other-uid-path',
			path: outOfOfficePath('alice'),
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify(VALID_BODY),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.userId',
				],
			},
		});

		expect(setResult.mismatches, formatParityMismatches(setResult.mismatches)).toEqual([]);

		const getResult = await runParityCase({
			name: 'dav-out-of-office-get-session-user-after-other-path',
			path: outOfOfficePath('admin'),
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.userId',
				],
			},
		});

		expect(getResult.mismatches, formatParityMismatches(getResult.mismatches)).toEqual([]);
	});

	it('POST firstDay after lastDay returns 400 firstDay error', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'dav-out-of-office-set-invalid-range',
			path: outOfOfficePath('admin'),
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({
					...VALID_BODY,
					firstDay: '2099-12-31',
					lastDay: '2020-01-01',
				}),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.error',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});
