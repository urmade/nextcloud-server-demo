import { describe, expect, it, beforeEach } from 'vitest';
import { resetAvatarStore } from '@/src/server/avatar/store';
import { getParityEnv } from '../env';
import { formatParityMismatches, runParityCase } from '../harness';
import { compareBinarySnapshots, snapshotBinaryResponse } from '../helpers/binary';
import { cookieJarToHeader } from '../helpers/cookies';
import { loginParitySessionWithCsrf } from '../helpers/session';

const SQUARE_PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
	'base64',
);

const NON_SQUARE_IMAGE = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAQAAAC2TSP/AAAADElEQVR42mP8/x8AAwMCAO2Z1r8AAAAASUVORK5CYII=',
	'base64',
);

async function resetParityAvatarStores(): Promise<void> {
	resetAvatarStore();

	const env = getParityEnv();

	await fetch(`${env.newBaseUrl}/api/parity/reset-avatar-store`, { method: 'POST' });
}

describe('parity: core avatar write', () => {
	beforeEach(async () => {
		await resetParityAvatarStores();
	});

	it('POST /index.php/avatar without CSRF returns 412 (core.Avatar#postAvatar.post)', async () => {
		const { jar } = await loginParitySessionWithCsrf();

		const result = await runParityCase({
			name: 'avatar-post-no-csrf',
			path: '/index.php/avatar',
			options: {
				method: 'POST',
				headers: {
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: new URLSearchParams().toString(),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: ['message'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /index.php/avatar unauthenticated returns 401 (core.Avatar#postAvatar.post)', async () => {
		const result = await runParityCase({
			name: 'avatar-post-unauth',
			path: '/index.php/avatar',
			options: {
				method: 'POST',
				headers: {
					accept: 'application/json',
				},
				body: new URLSearchParams().toString(),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: ['message'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /index.php/avatar without body returns 400 (core.Avatar#postAvatar.post)', async () => {
		const { jar, csrfToken } = await loginParitySessionWithCsrf();

		const result = await runParityCase({
			name: 'avatar-post-missing-file',
			path: '/index.php/avatar',
			options: {
				method: 'POST',
				headers: {
					'content-type': 'application/x-www-form-urlencoded',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: new URLSearchParams({
					requesttoken: csrfToken,
				}).toString(),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: ['data.message'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /index.php/avatar square PNG returns success then GET 200 (core.Avatar#postAvatar.post)', async () => {
		const env = getParityEnv();
		const { jar, csrfToken } = await loginParitySessionWithCsrf();
		const formData = new FormData();
		formData.append('files', new File([SQUARE_PNG], 'avatar.png', { type: 'image/png' }));
		formData.append('requesttoken', csrfToken);

		const postResult = await runParityCase({
			name: 'avatar-post-square',
			path: '/index.php/avatar',
			options: {
				method: 'POST',
				headers: {
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: formData,
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: ['status'],
			},
		});

		expect(postResult.mismatches, formatParityMismatches(postResult.mismatches)).toEqual([]);

		const [legacyResponse, newResponse] = await Promise.all([
			fetch(`${env.legacyBaseUrl}/index.php/avatar/admin/64`, {
				headers: { cookie: cookieJarToHeader(jar) ?? '' },
				redirect: 'manual',
			}),
			fetch(`${env.newBaseUrl}/index.php/avatar/admin/64`, {
				headers: { cookie: cookieJarToHeader(jar) ?? '' },
				redirect: 'manual',
			}),
		]);

		const [legacySnapshot, newSnapshot] = await Promise.all([
			snapshotBinaryResponse(legacyResponse),
			snapshotBinaryResponse(newResponse),
		]);

		expect(compareBinarySnapshots(
			legacySnapshot,
			newSnapshot,
			['x-nc-iscustomavatar'],
			Object.fromEntries(legacyResponse.headers.entries()),
			Object.fromEntries(newResponse.headers.entries()),
		)).toEqual([]);
		expect(newResponse.status).toBe(200);
		expect(newResponse.headers.get('x-nc-iscustomavatar')).toBe('1');
	});

	it('POST /index.php/avatar non-square image returns notsquare (core.Avatar#postAvatar.post)', async () => {
		const { jar, csrfToken } = await loginParitySessionWithCsrf();
		const formData = new FormData();
		formData.append('files', new File([NON_SQUARE_IMAGE], 'avatar.png', { type: 'image/png' }));
		formData.append('requesttoken', csrfToken);

		const result = await runParityCase({
			name: 'avatar-post-nonsquare',
			path: '/index.php/avatar',
			options: {
				method: 'POST',
				headers: {
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: formData,
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: ['data'],
				ignoreBodyPaths: ['image'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/index.php/avatar`, {
			method: 'POST',
			headers: {
				cookie: cookieJarToHeader(jar) ?? '',
			},
			body: formData,
		});
		const body = await response.json() as { data?: string; image?: string };

		expect(body.data).toBe('notsquare');
		expect(body.image).toMatch(/^data:image\/png;base64,/);
	});

	it('DELETE /index.php/avatar without CSRF returns 412 (core.Avatar#deleteAvatar.delete)', async () => {
		const { jar } = await loginParitySessionWithCsrf();

		const result = await runParityCase({
			name: 'avatar-delete-no-csrf',
			path: '/index.php/avatar',
			options: {
				method: 'DELETE',
				headers: {
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: ['message'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('DELETE /index.php/avatar returns [] then GET 404 [] (core.Avatar#deleteAvatar.delete)', async () => {
		const env = getParityEnv();
		const { jar, csrfToken } = await loginParitySessionWithCsrf();

		const uploadForm = new FormData();
		uploadForm.append('files', new File([SQUARE_PNG], 'avatar.png', { type: 'image/png' }));
		uploadForm.append('requesttoken', csrfToken);

		await fetch(`${env.newBaseUrl}/index.php/avatar`, {
			method: 'POST',
			headers: {
				cookie: cookieJarToHeader(jar) ?? '',
			},
			body: uploadForm,
		});

		const deleteResult = await runParityCase({
			name: 'avatar-delete-success',
			path: '/index.php/avatar',
			options: {
				method: 'DELETE',
				headers: {
					cookie: cookieJarToHeader(jar) ?? '',
					requesttoken: csrfToken,
				},
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(deleteResult.mismatches, formatParityMismatches(deleteResult.mismatches)).toEqual([]);

		const getResult = await runParityCase({
			name: 'avatar-get-after-delete',
			path: '/index.php/avatar/admin/64',
			options: {
				headers: {
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(getResult.mismatches, formatParityMismatches(getResult.mismatches)).toEqual([]);
	});
});
