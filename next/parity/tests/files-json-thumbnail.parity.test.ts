import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetSessionStore } from '@/src/server/auth/session-store';
import { getParityEnv } from '../env';
import { formatParityMismatches, runParityCase } from '../harness';
import { fetchLegacyMockSnapshot, hasLegacyMockFixture } from '../legacy-mock/adapter';
import { compareBinarySnapshots, snapshotBinaryResponse } from '../helpers/binary';
import { cookieJarToHeader } from '../helpers/cookies';
import { resetParityFilesStores } from '../helpers/files';
import { loginParitySession } from '../helpers/session';

const JSON_HEADERS = {
	Accept: 'application/json',
};

const MESSAGE_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: ['message'],
};

async function runBinaryParityCase(definition: {
	name: string;
	path: string;
	options?: { headers?: Record<string, string> };
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
		mismatches: compareBinarySnapshots(legacySnapshot, newSnapshot, [], legacyHeaders, newHeaders),
	};
}

async function fetchLegacyBinaryResponse(path: string, options: { headers?: Record<string, string> } = {}) {
	const env = getParityEnv();
	const method = 'GET';

	if (env.legacyUsesMock && hasLegacyMockFixture(path.split('?')[0], method)) {
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

describe('parity: files-json-thumbnail', () => {
	beforeEach(async () => {
		await resetParityFilesStores();
	});

	afterEach(async () => {
		resetSessionStore();
		await resetParityFilesStores();
	});

	it('GET /apps/files/api/v1/thumbnail/{x}/{y}/{file} happy path returns preview bytes', async () => {
		const jar = await loginParitySession();
		const result = await runBinaryParityCase({
			name: 'files-get-thumbnail-happy',
			path: '/apps/files/api/v1/thumbnail/32/32/welcome.txt',
			options: {
				headers: {
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
		});

		expect(result.mismatches, result.mismatches.map((m) => m.message).join('\n')).toEqual([]);
	});

	it('GET /index.php/apps/files/api/v1/thumbnail/{x}/{y}/{file} happy path shares handler', async () => {
		const jar = await loginParitySession();
		const result = await runBinaryParityCase({
			name: 'files-get-thumbnail-index-php-happy',
			path: '/index.php/apps/files/api/v1/thumbnail/32/32/welcome.txt',
			options: {
				headers: {
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
		});

		expect(result.mismatches, result.mismatches.map((m) => m.message).join('\n')).toEqual([]);
	});

	it('GET /apps/files/api/v1/thumbnail/{x}/{y}/{file} rejects non-positive dimensions', async () => {
		const jar = await loginParitySession();
		const result = await runParityCase({
			name: 'files-get-thumbnail-invalid-size',
			path: '/apps/files/api/v1/thumbnail/0/32/welcome.txt',
			options: {
				headers: {
					...JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: MESSAGE_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /apps/files/api/v1/thumbnail/{x}/{y}/{file} missing file returns 404 JSON', async () => {
		const jar = await loginParitySession();
		const result = await runParityCase({
			name: 'files-get-thumbnail-missing-file',
			path: '/apps/files/api/v1/thumbnail/32/32/unknown.jpg',
			options: {
				headers: {
					...JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: MESSAGE_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /apps/files/api/v1/thumbnail/{x}/{y}/{file} unauthenticated returns 401 JSON', async () => {
		const result = await runParityCase({
			name: 'files-get-thumbnail-unauthenticated',
			path: '/apps/files/api/v1/thumbnail/32/32/welcome.txt',
			options: {
				headers: JSON_HEADERS,
			},
			compare: MESSAGE_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /apps/files/api/v1/thumbnail/{x}/{y}/{file} strict cookie failure redirects home', async () => {
		const jar = await loginParitySession();
		delete jar.nc_sameSiteCookielax;
		delete jar.nc_sameSiteCookiestrict;

		const result = await runParityCase({
			name: 'files-get-thumbnail-strict-cookie',
			path: '/apps/files/api/v1/thumbnail/32/32/welcome.txt',
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
