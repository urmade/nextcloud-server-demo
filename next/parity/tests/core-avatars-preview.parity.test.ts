import { describe, expect, it } from 'vitest';
import { getParityEnv } from '../env';
import { formatParityMismatches, runParityCase } from '../harness';
import { fetchLegacyMockSnapshot, hasLegacyMockFixture } from '../legacy-mock/adapter';
import { compareBinarySnapshots, snapshotBinaryResponse } from '../helpers/binary';
import { cookieJarToHeader } from '../helpers/cookies';
import { basicAuthHeader, loginParitySession } from '../helpers/session';

function normalizeLocation(location: string | null | undefined): string | null {
	if (!location) {
		return null;
	}

	try {
		const url = new URL(location);

		return `${url.pathname}${url.search}`;
	} catch {
		return location;
	}
}

function pathOnly(path: string): string {
	return path.split('?')[0];
}

async function fetchLegacyBinaryResponse(path: string, options: { headers?: Record<string, string> } = {}) {
	const env = getParityEnv();
	const method = 'GET';

	if (env.legacyUsesMock && hasLegacyMockFixture(pathOnly(path), method)) {
		const snapshot = await fetchLegacyMockSnapshot(path, options);

		return new Response(snapshot.rawBody, {
			status: snapshot.status,
			headers: snapshot.headers,
		});
	}

	return fetch(`${env.legacyBaseUrl}${path}`, {
		headers: options.headers,
		redirect: 'manual',
	});
}

async function runBinaryParityCase(definition: {
	name: string;
	path: string;
	options?: { headers?: Record<string, string> };
	contractHeaders?: string[];
}) {
	const env = getParityEnv();
	const options = definition.options ?? {};
	const legacyPath = definition.path.startsWith('/') ? definition.path : `/${definition.path}`;

	const [legacyResponse, newResponse] = await Promise.all([
		fetchLegacyBinaryResponse(legacyPath, options),
		fetch(`${env.newBaseUrl}${legacyPath}`, {
			headers: options.headers,
			redirect: 'manual',
		}),
	]);

	const [legacySnapshot, newSnapshot] = await Promise.all([
		snapshotBinaryResponse(legacyResponse),
		snapshotBinaryResponse(newResponse),
	]);

	const legacyHeaders = Object.fromEntries(legacyResponse.headers.entries());
	const newHeaders = Object.fromEntries(newResponse.headers.entries());

	return {
		name: definition.name,
		path: definition.path,
		mismatches: compareBinarySnapshots(
			legacySnapshot,
			newSnapshot,
			definition.contractHeaders ?? [],
			legacyHeaders,
			newHeaders,
		),
	};
}

describe('parity: core avatars + preview', () => {
	it('GET /index.php/avatar/admin/64 happy path', async () => {
		const result = await runBinaryParityCase({
			name: 'avatar-admin-happy',
			path: '/index.php/avatar/admin/64',
			contractHeaders: ['x-nc-iscustomavatar', 'cache-control'],
		});

		expect(result.mismatches, result.mismatches.map((m) => m.message).join('\n')).toEqual([]);
	});

	it('GET /index.php/avatar/unknown/64 returns 404 JSON (validation)', async () => {
		const result = await runParityCase({
			name: 'avatar-unknown',
			path: '/index.php/avatar/unknown/64',
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /index.php/avatar/unknown/64 is public (no auth failure)', async () => {
		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/index.php/avatar/unknown/64`, { redirect: 'manual' });

		expect(response.status).toBe(404);
	});

	it('GET /index.php/avatar/admin/64/dark happy path', async () => {
		const result = await runBinaryParityCase({
			name: 'avatar-admin-dark-happy',
			path: '/index.php/avatar/admin/64/dark',
			contractHeaders: ['x-nc-iscustomavatar'],
		});

		expect(result.mismatches, result.mismatches.map((m) => m.message).join('\n')).toEqual([]);
	});

	it('GET /index.php/avatar/guest/Albert/64 returns generated guest avatar', async () => {
		const result = await runBinaryParityCase({
			name: 'guest-avatar-happy',
			path: '/index.php/avatar/guest/Albert/64',
			contractHeaders: ['x-nc-iscustomavatar'],
		});

		expect(result.mismatches, result.mismatches.map((m) => m.message).join('\n')).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/index.php/avatar/guest/Albert/64`, { redirect: 'manual' });

		expect(response.status).toBe(201);
	});

	it('GET /index.php/avatar/guest/Albert/64/dark happy path', async () => {
		const result = await runBinaryParityCase({
			name: 'guest-avatar-dark-happy',
			path: '/index.php/avatar/guest/Albert/64/dark',
			contractHeaders: ['x-nc-iscustomavatar'],
		});

		expect(result.mismatches, result.mismatches.map((m) => m.message).join('\n')).toEqual([]);
	});

	it('GET /index.php/core/mimeicon redirects to mime icon', async () => {
		const result = await runParityCase({
			name: 'mimeicon-happy',
			path: '/index.php/core/mimeicon?mime=image/png',
		});

		expect(result.mismatches.filter((mismatch) => mismatch.path !== 'headers.location'), formatParityMismatches(result.mismatches)).toEqual([]);
		expect(result.mismatches.find((mismatch) => mismatch.path === 'status')).toBeUndefined();

		const env = getParityEnv();
		const [legacyResponse, newResponse] = await Promise.all([
			fetchLegacyBinaryResponse('/index.php/core/mimeicon?mime=image/png'),
			fetch(`${env.newBaseUrl}/index.php/core/mimeicon?mime=image/png`, { redirect: 'manual' }),
		]);

		expect(normalizeLocation(legacyResponse.headers.get('location'))).toBe('/core/img/filetypes/image-png.svg');
		expect(normalizeLocation(newResponse.headers.get('location'))).toBe('/core/img/filetypes/image-png.svg');
	});

	it('GET /index.php/core/mimeicon is public (no auth failure)', async () => {
		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/index.php/core/mimeicon?mime=image/png`, { redirect: 'manual' });

		expect(response.status).toBe(303);
	});

	it('GET /index.php/core/preview requires auth (401)', async () => {
		const result = await runParityCase({
			name: 'preview-fileid-unauth',
			path: '/index.php/core/preview?fileId=100&x=32&y=32',
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: ['message'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /index.php/core/preview happy path by fileId', async () => {
		const jar = await loginParitySession();

		const result = await runBinaryParityCase({
			name: 'preview-fileid-happy',
			path: '/index.php/core/preview?fileId=100&x=32&y=32',
			options: {
				headers: {
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			contractHeaders: ['cache-control'],
		});

		expect(result.mismatches, result.mismatches.map((m) => m.message).join('\n')).toEqual([]);
	});

	it('GET /index.php/core/preview.png happy path by file path with Basic auth', async () => {
		const result = await runBinaryParityCase({
			name: 'preview-filepath-happy',
			path: '/index.php/core/preview.png?file=welcome.png&x=64&y=64',
			options: {
				headers: basicAuthHeader('admin', 'parity-test-password'),
			},
		});

		expect(result.mismatches, result.mismatches.map((m) => m.message).join('\n')).toEqual([]);
	});

	it('GET /index.php/core/preview.png rejects missing file (validation)', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'preview-filepath-missing-file',
			path: '/index.php/core/preview.png?x=32&y=32',
			options: {
				headers: {
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /index.php/core/preview rejects x=0 (validation)', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'preview-fileid-invalid-dimensions',
			path: '/index.php/core/preview?fileId=100&x=0&y=32',
			options: {
				headers: {
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /index.php/core/references/preview/parity-reference happy path', async () => {
		const result = await runBinaryParityCase({
			name: 'reference-preview-happy',
			path: '/index.php/core/references/preview/parity-reference',
		});

		expect(result.mismatches, result.mismatches.map((m) => m.message).join('\n')).toEqual([]);
	});

	it('GET /index.php/core/references/preview/unknown returns 404 (validation)', async () => {
		const result = await runParityCase({
			name: 'reference-preview-not-found',
			path: '/index.php/core/references/preview/unknown-reference',
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /index.php/core/references/preview/parity-reference is public (no auth failure)', async () => {
		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/index.php/core/references/preview/parity-reference`, { redirect: 'manual' });

		expect(response.status).toBe(200);
	});
});
