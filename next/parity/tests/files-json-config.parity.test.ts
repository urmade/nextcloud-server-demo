import { afterEach, describe, expect, it } from 'vitest';
import { resetSessionStore } from '@/src/server/auth/session-store';
import { resetDavFileStore } from '@/src/server/dav/store';
import { resetFilesApiStores } from '@/src/server/files/api';
import { USER_CONFIG_DEFAULTS } from '@/src/server/files/types';
import { getParityEnv } from '../env';
import { fetchLegacyMockSnapshot } from '../legacy-mock/adapter';
import { formatParityMismatches, runParityCase } from '../harness';
import { cookieJarToHeader } from '../helpers/cookies';
import { loginParitySession } from '../helpers/session';

const JSON_HEADERS = {
	Accept: 'application/json',
};

const ENVELOPE_COMPARE = {
	contractHeaders: ['content-type', 'cache-control'],
	includeBodyPaths: ['message', 'data'],
};

const GRID_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: ['gridview'],
};

const STATS_COMPARE = {
	contractHeaders: ['content-type', 'cache-control'],
	includeBodyPaths: [
		'message',
		'data.free',
		'data.used',
		'data.quota',
		'data.total',
		'data.relative',
		'data.owner',
		'data.ownerDisplayName',
		'data.mountType',
		'data.mountPoint',
	],
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

describe('parity: files-json-config', () => {
	afterEach(() => {
		resetSessionStore();
		resetDavFileStore();
		resetFilesApiStores();
	});

	it('GET /apps/files/api/v1/configs happy path returns user config defaults', async () => {
		const jar = await loginParitySession();
		const result = await runParityCase({
			name: 'files-get-configs-happy',
			path: '/apps/files/api/v1/configs',
			options: {
				headers: {
					...JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: ENVELOPE_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const response = await authenticatedFetch('/apps/files/api/v1/configs', jar);
		const body = await response.json() as { message: string; data: typeof USER_CONFIG_DEFAULTS };

		expect(response.status).toBe(200);
		expect(body.message).toBe('ok');
		expect(body.data).toEqual(USER_CONFIG_DEFAULTS);
	});

	it('GET /apps/files/api/v1/configs unauthenticated returns 401 JSON', async () => {
		const result = await runParityCase({
			name: 'files-get-configs-unauthenticated',
			path: '/apps/files/api/v1/configs',
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

	it('GET /apps/files/api/v1/configs strict cookie failure redirects home', async () => {
		const jar = await loginParitySession();
		delete jar.nc_sameSiteCookielax;
		delete jar.nc_sameSiteCookiestrict;

		const result = await runParityCase({
			name: 'files-get-configs-strict-cookie',
			path: '/apps/files/api/v1/configs',
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

	it('GET /apps/files/api/v1/views happy path returns view config map', async () => {
		const jar = await loginParitySession();
		const result = await runParityCase({
			name: 'files-get-view-configs-happy',
			path: '/apps/files/api/v1/views',
			options: {
				headers: {
					...JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: ENVELOPE_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const response = await authenticatedFetch('/apps/files/api/v1/views', jar);
		const body = await response.json() as { message: string; data: Record<string, unknown> };

		expect(response.status).toBe(200);
		expect(body.message).toBe('ok');
		expect(body.data).toEqual({});
	});

	it('GET /apps/files/api/v1/views unauthenticated returns 401 JSON', async () => {
		const result = await runParityCase({
			name: 'files-get-view-configs-unauthenticated',
			path: '/apps/files/api/v1/views',
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

	it('GET /apps/files/api/v1/views strict cookie failure redirects home', async () => {
		const jar = await loginParitySession();
		delete jar.nc_sameSiteCookielax;
		delete jar.nc_sameSiteCookiestrict;

		const result = await runParityCase({
			name: 'files-get-view-configs-strict-cookie',
			path: '/apps/files/api/v1/views',
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

	it('GET /apps/files/api/v1/stats happy path returns storage stats envelope', async () => {
		const jar = await loginParitySession();
		const result = await runParityCase({
			name: 'files-get-storage-stats-happy',
			path: '/apps/files/api/v1/stats?dir=/',
			options: {
				headers: {
					...JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: STATS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /apps/files/api/v1/stats unauthenticated returns 401 JSON', async () => {
		const result = await runParityCase({
			name: 'files-get-storage-stats-unauthenticated',
			path: '/apps/files/api/v1/stats',
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

	it('GET /apps/files/api/v1/stats strict cookie failure redirects home', async () => {
		const jar = await loginParitySession();
		delete jar.nc_sameSiteCookielax;
		delete jar.nc_sameSiteCookiestrict;

		const result = await runParityCase({
			name: 'files-get-storage-stats-strict-cookie',
			path: '/apps/files/api/v1/stats',
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

	it('GET /apps/files/api/v1/showgridview happy path returns gridview flag', async () => {
		const jar = await loginParitySession();
		const result = await runParityCase({
			name: 'files-get-grid-view-happy',
			path: '/apps/files/api/v1/showgridview',
			options: {
				headers: {
					...JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: GRID_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const response = await authenticatedFetch('/apps/files/api/v1/showgridview', jar);
		const body = await response.json() as { gridview: boolean };

		expect(response.status).toBe(200);
		expect(body.gridview).toBe(false);
	});

	it('GET /apps/files/api/v1/showgridview unauthenticated returns 401 JSON', async () => {
		const result = await runParityCase({
			name: 'files-get-grid-view-unauthenticated',
			path: '/apps/files/api/v1/showgridview',
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

	it('GET /apps/files/api/v1/showgridview strict cookie failure redirects home', async () => {
		const jar = await loginParitySession();
		delete jar.nc_sameSiteCookielax;
		delete jar.nc_sameSiteCookiestrict;

		const result = await runParityCase({
			name: 'files-get-grid-view-strict-cookie',
			path: '/apps/files/api/v1/showgridview',
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

	it('legacy mock and Next.js both treat show_grid legacy pref independently over HTTP', async () => {
		const jar = await loginParitySession();
		const legacy = await fetchLegacyMockSnapshot('/apps/files/api/v1/showgridview', {
			headers: {
				...JSON_HEADERS,
				cookie: cookieJarToHeader(jar) ?? '',
			},
		});
		const response = await authenticatedFetch('/apps/files/api/v1/showgridview', jar);

		expect(legacy.status).toBe(200);
		expect(response.status).toBe(200);
		expect(legacy.body).toEqual({ gridview: false });
		expect(await response.json()).toEqual({ gridview: false });
	});
});
