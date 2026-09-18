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

function mutationHeaders(jar: Record<string, string>, csrfToken: string, contentType = 'application/json') {
	return {
		...JSON_HEADERS,
		'content-type': contentType,
		requesttoken: csrfToken,
		cookie: cookieJarToHeader(jar) ?? '',
	};
}

describe('parity: files-json-crop-tags', () => {
	afterEach(() => {
		resetSessionStore();
		resetDavFileStore();
		resetFilesApiStores();
	});

	it('POST /apps/files/api/v1/cropimagepreviews happy path toggles crop_image_previews', async () => {
		const { jar, csrfToken } = await loginParitySessionWithCsrf();
		const result = await runParityCase({
			name: 'files-crop-image-previews-happy',
			path: '/apps/files/api/v1/cropimagepreviews',
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

		const env = getParityEnv();
		const configsResponse = await fetch(`${env.newBaseUrl}/apps/files/api/v1/configs`, {
			redirect: 'manual',
			headers: {
				...JSON_HEADERS,
				cookie: cookieJarToHeader(jar) ?? '',
			},
		});
		const configsBody = await configsResponse.json() as { data: { crop_image_previews: boolean } };

		expect(configsResponse.status).toBe(200);
		expect(configsBody.data.crop_image_previews).toBe(true);
	});

	it('POST /apps/files/api/v1/cropimagepreviews unauthenticated returns 401 JSON', async () => {
		const result = await runParityCase({
			name: 'files-crop-image-previews-unauthenticated',
			path: '/apps/files/api/v1/cropimagepreviews',
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

	it('POST /apps/files/api/v1/cropimagepreviews strict cookie failure redirects home', async () => {
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
			name: 'files-crop-image-previews-strict-cookie',
			path: '/apps/files/api/v1/cropimagepreviews',
			options: {
				method: 'POST',
				headers: mutationHeaders(jar, csrfBody.token),
				body: JSON.stringify({ value: true }),
			},
			compare: {
				contractHeaders: ['location'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /apps/files/api/v1/files/{path} happy path updates tags', async () => {
		const { jar, csrfToken } = await loginParitySessionWithCsrf();
		const result = await runParityCase({
			name: 'files-update-file-tags-happy',
			path: '/apps/files/api/v1/files/welcome.txt',
			options: {
				method: 'POST',
				headers: mutationHeaders(jar, csrfToken),
				body: JSON.stringify({ tags: ['Tag1', 'Tag2'] }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: ['tags'],
				unorderedListPaths: ['body.tags'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /apps/files/api/v1/files/{path} without tags returns empty object', async () => {
		const { jar, csrfToken } = await loginParitySessionWithCsrf();
		const result = await runParityCase({
			name: 'files-update-file-tags-omitted',
			path: '/apps/files/api/v1/files/welcome.txt',
			options: {
				method: 'POST',
				headers: mutationHeaders(jar, csrfToken),
				body: JSON.stringify({}),
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /apps/files/api/v1/files/{path} unauthenticated returns 401 JSON', async () => {
		const result = await runParityCase({
			name: 'files-update-file-tags-unauthenticated',
			path: '/apps/files/api/v1/files/welcome.txt',
			options: {
				method: 'POST',
				headers: {
					...JSON_HEADERS,
					'content-type': 'application/json',
				},
				body: JSON.stringify({ tags: ['Tag1'] }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: ['message'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /apps/files/api/v1/files/{path} unknown path returns 404 JSON', async () => {
		const { jar, csrfToken } = await loginParitySessionWithCsrf();
		const result = await runParityCase({
			name: 'files-update-file-tags-not-found',
			path: '/apps/files/api/v1/files/does-not-exist.txt',
			options: {
				method: 'POST',
				headers: mutationHeaders(jar, csrfToken),
				body: JSON.stringify({ tags: ['Tag1'] }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: ['message'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});
