import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetSessionStore } from '@/src/server/auth/session-store';
import { formatParityMismatches, runParityCase } from '../harness';
import { compareBinarySnapshots, snapshotBinaryResponse } from '../helpers/binary';
import { cookieJarToHeader } from '../helpers/cookies';
import { resetParityFilesStores } from '../helpers/files';
import { resetParityShareStores } from '../helpers/files-sharing';
import { getParityEnv } from '../env';
import {
	loginParitySession,
	OCS_JSON_HEADERS,
} from '../helpers/session';

const SHARES_PATH = '/ocs/v2.php/apps/files_sharing/api/v1/shares?format=json';

const HTML_COMPARE = {
	contractHeaders: ['content-type'],
};

const JSON_COMPARE = {
	contractHeaders: ['content-type'],
};

async function createLinkShare(
	jar: Record<string, string>,
	options: { path: string; password?: string; hideDownload?: boolean },
): Promise<string> {
	const result = await runParityCase({
		name: 'seed-link-share',
		path: SHARES_PATH,
		options: {
			method: 'POST',
			headers: {
				...OCS_JSON_HEADERS,
				'content-type': 'application/json',
				cookie: cookieJarToHeader(jar) ?? '',
			},
			body: JSON.stringify({
				path: options.path,
				shareType: 3,
				password: options.password,
				hideDownload: options.hideDownload ? 'true' : undefined,
			}),
		},
		compare: {
			contractHeaders: ['content-type'],
			includeBodyPaths: ['ocs.meta.status', 'ocs.meta.statuscode', 'ocs.data.token'],
			unstableIdPaths: ['ocs.data.token', 'ocs.data.url', 'ocs.data.id'],
		},
	});

	expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/ocs/v2.php/apps/files_sharing/api/v1/shares/1?format=json`, {
		headers: {
			...OCS_JSON_HEADERS,
			cookie: cookieJarToHeader(jar) ?? '',
		},
	});
	const body = await response.json() as { ocs: { data: Array<{ token: string }> } };
	const token = body.ocs.data[0]?.token;

	expect(typeof token, `seeded link share has no token: ${JSON.stringify(body)}`).toBe('string');

	return token;
}

describe('parity: files-sharing-public-preview', () => {
	beforeEach(async () => {
		await resetParityFilesStores();
		await resetParityShareStores();
	});

	afterEach(async () => {
		resetSessionStore();
		await resetParityFilesStores();
		await resetParityShareStores();
	});

	it('GET /apps/files_sharing/publicpreview/{token} returns 200 binary for open link share', async () => {
		const jar = await loginParitySession();
		const token = await createLinkShare(jar, { path: '/welcome.txt' });

		const result = await runParityCase({
			name: 'public-preview-open-link',
			path: `/apps/files_sharing/publicpreview/${token}`,
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/apps/files_sharing/publicpreview/${token}`, {
			redirect: 'manual',
		});
		const snapshot = await snapshotBinaryResponse(response);

		expect(snapshot.status).toBe(200);
		expect(snapshot.contentType).toBe('image/png');
		expect(snapshot.sizeClass).not.toBe('empty');
	});

	it('GET publicpreview returns 404 guest HTML for unknown token', async () => {
		const result = await runParityCase({
			name: 'public-preview-unknown-token',
			path: '/apps/files_sharing/publicpreview/does-not-exist-token',
			compare: HTML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/apps/files_sharing/publicpreview/does-not-exist-token`, {
			redirect: 'manual',
		});

		expect(response.status).toBe(404);
		expect(response.headers.get('content-type')).toBe('text/html; charset=UTF-8');
		expect(await response.text()).toContain('class="guest"');
	});

	it('GET publicpreview on password share without public session returns 404 HTML', async () => {
		const jar = await loginParitySession();
		const token = await createLinkShare(jar, { path: '/welcome.txt', password: 'secret' });

		const result = await runParityCase({
			name: 'public-preview-password-unauth',
			path: `/apps/files_sharing/publicpreview/${token}`,
			compare: HTML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/apps/files_sharing/publicpreview/${token}`, {
			redirect: 'manual',
		});

		expect(response.status).toBe(404);
		expect(response.headers.get('content-type')).toBe('text/html; charset=UTF-8');
	});

	it('GET publicpreview on folder share without file returns 400 JSON', async () => {
		const jar = await loginParitySession();
		const token = await createLinkShare(jar, { path: '/Documents' });

		const result = await runParityCase({
			name: 'public-preview-folder-missing-file',
			path: `/apps/files_sharing/publicpreview/${token}`,
			compare: JSON_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/apps/files_sharing/publicpreview/${token}`, {
			redirect: 'manual',
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual([]);
	});

	it('GET publicpreview on hideDownload share without x-nc-preview returns 403 JSON', async () => {
		const jar = await loginParitySession();
		const token = await createLinkShare(jar, { path: '/welcome.txt', hideDownload: true });

		const result = await runParityCase({
			name: 'public-preview-hide-download-forbidden',
			path: `/apps/files_sharing/publicpreview/${token}`,
			compare: JSON_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/apps/files_sharing/publicpreview/${token}`, {
			redirect: 'manual',
		});

		expect(response.status).toBe(403);
		expect(await response.json()).toEqual([]);
	});

	it('GET /index.php/apps/files_sharing/publicpreview/{token} matches the app route', async () => {
		const jar = await loginParitySession();
		const token = await createLinkShare(jar, { path: '/welcome.txt' });
		const env = getParityEnv();

		const [legacyResponse, newResponse] = await Promise.all([
			fetch(`${env.legacyUsesMock ? env.newBaseUrl : env.legacyBaseUrl}/index.php/apps/files_sharing/publicpreview/${token}`, {
				redirect: 'manual',
			}),
			fetch(`${env.newBaseUrl}/index.php/apps/files_sharing/publicpreview/${token}`, {
				redirect: 'manual',
			}),
		]);

		const [legacySnapshot, newSnapshot] = await Promise.all([
			snapshotBinaryResponse(legacyResponse),
			snapshotBinaryResponse(newResponse),
		]);

		const mismatches = compareBinarySnapshots(
			legacySnapshot,
			newSnapshot,
			['cache-control'],
			Object.fromEntries(legacyResponse.headers.entries()),
			Object.fromEntries(newResponse.headers.entries()),
		);

		expect(mismatches, mismatches.map((m) => m.message).join('\n')).toEqual([]);
		expect(newResponse.status).toBe(200);
		expect(newResponse.headers.get('content-type')).toBe('image/png');
	});
});
