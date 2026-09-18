import { afterEach, describe, expect, it } from 'vitest';
import { resetSessionStore } from '@/src/server/auth/session-store';
import { resetDavFileStore } from '@/src/server/dav/store';
import { resetFilesApiStores } from '@/src/server/files/api';
import { getParityEnv } from '../env';
import { formatParityMismatches, runParityCase } from '../harness';
import { cookieJarToHeader } from '../helpers/cookies';
import { loginParitySession, loginParitySessionWithCsrf } from '../helpers/session';

const JSON_HEADERS = {
	Accept: 'application/json',
};

const ENVELOPE_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: ['message', 'data'],
};

const SET_CONFIG_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: ['message', 'data.key', 'data.value'],
};

function mutationHeaders(jar: Record<string, string>, csrfToken: string, contentType = 'application/json') {
	return {
		...JSON_HEADERS,
		'content-type': contentType,
		requesttoken: csrfToken,
		cookie: cookieJarToHeader(jar) ?? '',
	};
}

describe('parity: files-json-writes', () => {
	afterEach(() => {
		resetSessionStore();
		resetDavFileStore();
		resetFilesApiStores();
	});

	it('PUT /apps/files/api/v1/config/{key} happy path updates user config', async () => {
		const { jar, csrfToken } = await loginParitySessionWithCsrf();
		const result = await runParityCase({
			name: 'files-set-config-happy',
			path: '/apps/files/api/v1/config/folder_tree',
			options: {
				method: 'PUT',
				headers: mutationHeaders(jar, csrfToken),
				body: JSON.stringify({ value: false }),
			},
			compare: SET_CONFIG_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PUT /apps/files/api/v1/config/{key} unauthenticated returns 401 JSON', async () => {
		const result = await runParityCase({
			name: 'files-set-config-unauthenticated',
			path: '/apps/files/api/v1/config/folder_tree',
			options: {
				method: 'PUT',
				headers: {
					...JSON_HEADERS,
					'content-type': 'application/json',
				},
				body: JSON.stringify({ value: false }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: ['message'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PUT /apps/files/api/v1/config/{key} unknown key returns 400 JSON', async () => {
		const { jar, csrfToken } = await loginParitySessionWithCsrf();
		const result = await runParityCase({
			name: 'files-set-config-unknown-key',
			path: '/apps/files/api/v1/config/not_a_real_key',
			options: {
				method: 'PUT',
				headers: mutationHeaders(jar, csrfToken),
				body: JSON.stringify({ value: true }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: ['message'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PUT /apps/files/api/v1/config/{key} strict cookie failure redirects home', async () => {
		const jar = await loginParitySession();
		delete jar.nc_sameSiteCookielax;
		delete jar.nc_sameSiteCookiestrict;
		const { token } = await (async () => {
			const env = getParityEnv();
			const csrfResponse = await fetch(`${env.newBaseUrl}/csrftoken`, {
				redirect: 'manual',
				headers: {
					cookie: cookieJarToHeader(jar) ?? '',
				},
			});
			const csrfBody = await csrfResponse.json() as { token: string };

			return { token: csrfBody.token };
		})();

		const result = await runParityCase({
			name: 'files-set-config-strict-cookie',
			path: '/apps/files/api/v1/config/folder_tree',
			options: {
				method: 'PUT',
				headers: mutationHeaders(jar, token),
				body: JSON.stringify({ value: false }),
			},
			compare: {
				contractHeaders: ['location'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PUT /apps/files/api/v1/views happy path updates view config', async () => {
		const { jar, csrfToken } = await loginParitySessionWithCsrf();
		const result = await runParityCase({
			name: 'files-set-view-config-happy',
			path: '/apps/files/api/v1/views',
			options: {
				method: 'PUT',
				headers: mutationHeaders(jar, csrfToken),
				body: JSON.stringify({
					view: 'files',
					key: 'sorting_direction',
					value: 'desc',
				}),
			},
			compare: ENVELOPE_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PUT /apps/files/api/v1/views/{view}/{key} happy path matches bulk body shape', async () => {
		const { jar, csrfToken } = await loginParitySessionWithCsrf();
		const result = await runParityCase({
			name: 'files-set-view-config-path-happy',
			path: '/apps/files/api/v1/views/files/sorting_direction',
			options: {
				method: 'PUT',
				headers: mutationHeaders(jar, csrfToken),
				body: JSON.stringify({ value: 'asc' }),
			},
			compare: ENVELOPE_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PUT /apps/files/api/v1/views unauthenticated returns 401 JSON', async () => {
		const result = await runParityCase({
			name: 'files-set-view-config-unauthenticated',
			path: '/apps/files/api/v1/views',
			options: {
				method: 'PUT',
				headers: {
					...JSON_HEADERS,
					'content-type': 'application/json',
				},
				body: JSON.stringify({
					view: 'files',
					key: 'sorting_direction',
					value: 'desc',
				}),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: ['message'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PUT /apps/files/api/v1/views unknown key returns 400 JSON', async () => {
		const { jar, csrfToken } = await loginParitySessionWithCsrf();
		const result = await runParityCase({
			name: 'files-set-view-config-unknown-key',
			path: '/apps/files/api/v1/views',
			options: {
				method: 'PUT',
				headers: mutationHeaders(jar, csrfToken),
				body: JSON.stringify({
					view: 'files',
					key: 'not_a_real_key',
					value: 'desc',
				}),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: ['message'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /apps/files/api/v1/showhidden happy path toggles hidden files', async () => {
		const { jar, csrfToken } = await loginParitySessionWithCsrf();
		const result = await runParityCase({
			name: 'files-show-hidden-happy',
			path: '/apps/files/api/v1/showhidden',
			options: {
				method: 'POST',
				headers: mutationHeaders(jar, csrfToken),
				body: JSON.stringify({ value: true }),
			},
			compare: {
				contractHeaders: [],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /apps/files/api/v1/showhidden unauthenticated returns 401 JSON', async () => {
		const result = await runParityCase({
			name: 'files-show-hidden-unauthenticated',
			path: '/apps/files/api/v1/showhidden',
			options: {
				method: 'POST',
				headers: {
					...JSON_HEADERS,
					'content-type': 'application/json',
				},
				body: JSON.stringify({ value: true }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: ['message'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /apps/files/api/v1/showgridview happy path toggles legacy show_grid', async () => {
		const { jar, csrfToken } = await loginParitySessionWithCsrf();
		const result = await runParityCase({
			name: 'files-show-grid-happy',
			path: '/apps/files/api/v1/showgridview',
			options: {
				method: 'POST',
				headers: mutationHeaders(jar, csrfToken),
				body: JSON.stringify({ show: true }),
			},
			compare: {
				contractHeaders: [],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const gridResponse = await fetch(`${env.newBaseUrl}/apps/files/api/v1/showgridview`, {
			redirect: 'manual',
			headers: {
				...JSON_HEADERS,
				cookie: cookieJarToHeader(jar) ?? '',
			},
		});
		const gridBody = await gridResponse.json() as { gridview: boolean };

		expect(gridResponse.status).toBe(200);
		expect(gridBody.gridview).toBe(true);
	});

	it('POST /apps/files/api/v1/showgridview unauthenticated returns 401 JSON', async () => {
		const result = await runParityCase({
			name: 'files-show-grid-unauthenticated',
			path: '/apps/files/api/v1/showgridview',
			options: {
				method: 'POST',
				headers: {
					...JSON_HEADERS,
					'content-type': 'application/json',
				},
				body: JSON.stringify({ show: true }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: ['message'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /apps/files/api/v1/showgridview strict cookie failure redirects home', async () => {
		const jar = await loginParitySession();
		delete jar.nc_sameSiteCookielax;
		delete jar.nc_sameSiteCookiestrict;
		const env = getParityEnv();
		const csrfResponse = await fetch(`${env.newBaseUrl}/csrftoken`, {
			redirect: 'manual',
			headers: {
				cookie: cookieJarToHeader(jar) ?? '',
			},
		});
		const csrfBody = await csrfResponse.json() as { token: string };

		const result = await runParityCase({
			name: 'files-show-grid-strict-cookie',
			path: '/apps/files/api/v1/showgridview',
			options: {
				method: 'POST',
				headers: mutationHeaders(jar, csrfBody.token),
				body: JSON.stringify({ show: true }),
			},
			compare: {
				contractHeaders: ['location'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});
