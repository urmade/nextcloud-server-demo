import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetSessionStore } from '@/src/server/auth/session-store';
import { getParityEnv } from '../env';
import { formatParityMismatches, runParityCase } from '../harness';
import { cookieJarToHeader } from '../helpers/cookies';
import { resetParityFilesStores } from '../helpers/files';
import { loginParitySession } from '../helpers/session';

const JSON_HEADERS = {
	Accept: 'application/json',
};

const RECENT_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: ['files'],
	unorderedListPaths: ['files'],
};

async function authenticatedFetch(path: string, jar: Record<string, string>) {
	const env = getParityEnv();

	return fetch(`${env.newBaseUrl}${path}`, {
		redirect: 'manual',
		headers: {
			...JSON_HEADERS,
			cookie: cookieJarToHeader(jar) ?? '',
		},
	});
}

describe('parity: files-json-recent', () => {
	beforeEach(async () => {
		await resetParityFilesStores();
	});

	afterEach(async () => {
		resetSessionStore();
		await resetParityFilesStores();
	});

	it('GET /apps/files/api/v1/recent/ happy path returns recent files', async () => {
		const jar = await loginParitySession();
		const result = await runParityCase({
			name: 'files-get-recent-happy',
			path: '/apps/files/api/v1/recent/',
			options: {
				headers: {
					...JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: RECENT_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const response = await authenticatedFetch('/apps/files/api/v1/recent/', jar);
		const body = await response.json() as { files: Array<{ id: number; mtime: number; path: string }> };

		expect(response.status).toBe(200);
		expect(body.files.length).toBeGreaterThanOrEqual(1);
		expect(body.files.some((entry) => entry.id === 1001)).toBe(true);
		expect(body.files.every((entry) => entry.mtime > 1_000_000_000_000)).toBe(true);
		expect(body.files.find((entry) => entry.id === 1001)?.path).toBe('/');
		expect(body.files.find((entry) => entry.id === 1003)?.path).toBe('/Documents');
	});

	it('GET /apps/files/api/v1/recent/ unauthenticated returns 401 JSON', async () => {
		const result = await runParityCase({
			name: 'files-get-recent-unauthenticated',
			path: '/apps/files/api/v1/recent/',
			options: {
				headers: JSON_HEADERS,
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: ['message'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /apps/files/api/v1/recent/ strict cookie failure redirects home', async () => {
		const jar = await loginParitySession();
		delete jar.nc_sameSiteCookielax;
		delete jar.nc_sameSiteCookiestrict;

		const result = await runParityCase({
			name: 'files-get-recent-strict-cookie',
			path: '/apps/files/api/v1/recent/',
			options: {
				headers: {
					...JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['location'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});
