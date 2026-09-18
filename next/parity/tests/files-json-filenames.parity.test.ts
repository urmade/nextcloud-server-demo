import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetSessionStore } from '@/src/server/auth/session-store';
import { formatParityMismatches, runParityCase } from '../harness';
import { cookieJarToHeader } from '../helpers/cookies';
import { resetParityFilesStores } from '../helpers/files';
import { getFilenamesSessionId, seedNonAdminSession } from '../legacy-mock/files-filenames';
import { loginParitySession, OCS_JSON_HEADERS, OCS_META_PATHS } from '../helpers/session';

const SANITIZATION_PATH = '/ocs/v2.php/apps/files/api/v1/filenames/sanitization?format=json';
const WINDOWS_COMPAT_PATH = '/ocs/v2.php/apps/files/api/v1/filenames/windows-compatibility?format=json';

const OCS_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: OCS_META_PATHS,
};

const STATUS_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: [
		...OCS_META_PATHS,
		'ocs.data.status',
		'ocs.data.processed',
		'ocs.data.total',
		'ocs.data.errors',
	],
};

describe('parity: files-json-filenames', () => {
	beforeEach(async () => {
		await resetParityFilesStores();
	});

	afterEach(async () => {
		resetSessionStore();
		await resetParityFilesStores();
	});

	it('GET sanitization status requires auth (401)', async () => {
		const result = await runParityCase({
			name: 'filenames-status-unauth',
			path: SANITIZATION_PATH,
			options: {
				headers: OCS_JSON_HEADERS,
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET sanitization status requires admin (403)', async () => {
		const jar = await loginParitySession();
		const sessionId = getFilenamesSessionId({ headers: { cookie: cookieJarToHeader(jar) ?? '' } });

		if (sessionId) {
			seedNonAdminSession(sessionId, 'alice');
		}

		const result = await runParityCase({
			name: 'filenames-status-non-admin',
			path: SANITIZATION_PATH,
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET sanitization status happy path', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'filenames-status-happy',
			path: SANITIZATION_PATH,
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: STATUS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST sanitization happy path schedules job', async () => {
		const jar = await loginParitySession();

		const startResult = await runParityCase({
			name: 'filenames-sanitize-happy',
			path: SANITIZATION_PATH,
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({ limit: 10 }),
			},
			compare: OCS_COMPARE,
		});

		expect(startResult.mismatches, formatParityMismatches(startResult.mismatches)).toEqual([]);

		const statusResult = await runParityCase({
			name: 'filenames-sanitize-happy-status',
			path: SANITIZATION_PATH,
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: STATUS_COMPARE,
		});

		expect(statusResult.mismatches, formatParityMismatches(statusResult.mismatches)).toEqual([]);
	});

	it('POST sanitization rejects limit below 1', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'filenames-sanitize-invalid-limit',
			path: SANITIZATION_PATH,
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({ limit: 0 }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.meta.message',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST sanitization rejects empty replacement character', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'filenames-sanitize-empty-replacement',
			path: SANITIZATION_PATH,
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({ limit: 10, charReplacement: '' }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.meta.message',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST sanitization rejects invalid replacement character', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'filenames-sanitize-invalid-replacement',
			path: SANITIZATION_PATH,
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({ limit: 10, charReplacement: 'ab' }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.meta.message',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST sanitization rejects already running job', async () => {
		const jar = await loginParitySession();
		const headers = {
			...OCS_JSON_HEADERS,
			'content-type': 'application/json',
			cookie: cookieJarToHeader(jar) ?? '',
		};

		const first = await runParityCase({
			name: 'filenames-sanitize-first',
			path: SANITIZATION_PATH,
			options: {
				method: 'POST',
				headers,
				body: JSON.stringify({ limit: 10 }),
			},
			compare: OCS_COMPARE,
		});

		expect(first.mismatches, formatParityMismatches(first.mismatches)).toEqual([]);

		const second = await runParityCase({
			name: 'filenames-sanitize-already-running',
			path: SANITIZATION_PATH,
			options: {
				method: 'POST',
				headers,
				body: JSON.stringify({ limit: 10 }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.meta.message',
				],
			},
		});

		expect(second.mismatches, formatParityMismatches(second.mismatches)).toEqual([]);
	});

	it('DELETE sanitization happy path stops running job', async () => {
		const jar = await loginParitySession();
		const headers = {
			...OCS_JSON_HEADERS,
			'content-type': 'application/json',
			cookie: cookieJarToHeader(jar) ?? '',
		};

		const start = await runParityCase({
			name: 'filenames-stop-start',
			path: SANITIZATION_PATH,
			options: {
				method: 'POST',
				headers,
				body: JSON.stringify({ limit: 10 }),
			},
			compare: OCS_COMPARE,
		});

		expect(start.mismatches, formatParityMismatches(start.mismatches)).toEqual([]);

		const stop = await runParityCase({
			name: 'filenames-stop-happy',
			path: SANITIZATION_PATH,
			options: {
				method: 'DELETE',
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: OCS_COMPARE,
		});

		expect(stop.mismatches, formatParityMismatches(stop.mismatches)).toEqual([]);
	});

	it('DELETE sanitization rejects when not running', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'filenames-stop-not-running',
			path: SANITIZATION_PATH,
			options: {
				method: 'DELETE',
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.meta.message',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST windows-compatibility happy path toggles enabled', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'filenames-windows-compat-happy',
			path: WINDOWS_COMPAT_PATH,
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({ enabled: true }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.enabled',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST windows-compatibility requires auth (401)', async () => {
		const result = await runParityCase({
			name: 'filenames-windows-compat-unauth',
			path: WINDOWS_COMPAT_PATH,
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
				},
				body: JSON.stringify({ enabled: true }),
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});
