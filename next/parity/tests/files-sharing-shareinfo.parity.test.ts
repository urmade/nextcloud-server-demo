import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetSessionStore } from '@/src/server/auth/session-store';
import {
	setOutgoingServer2ServerShareEnabled,
} from '@/src/server/files_sharing/config';
import { formatParityMismatches, runParityCase } from '../harness';
import { cookieJarToHeader } from '../helpers/cookies';
import { resetParityFilesStores } from '../helpers/files';
import { resetParityShareStores } from '../helpers/files-sharing';
import { getParityEnv } from '../env';
import {
	loginParitySession,
	OCS_JSON_HEADERS,
} from '../helpers/session';

const SHAREINFO_PATH = '/apps/files_sharing/shareinfo';
const SHARES_PATH = '/ocs/v2.php/apps/files_sharing/api/v1/shares?format=json';

const JSON_COMPARE = {
	contractHeaders: ['content-type'],
};

async function createLinkShare(
	jar: Record<string, string>,
	options: { path: string; password?: string },
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

async function setOutgoingS2SOnBothSides(enabled: boolean): Promise<void> {
	setOutgoingServer2ServerShareEnabled(enabled);

	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/api/parity/set-files-sharing-config`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
		},
		body: JSON.stringify({ outgoingServer2ServerShareEnabled: enabled }),
	});

	if (!response.ok) {
		throw new Error(`Failed to set files_sharing config (${response.status})`);
	}
}

describe('parity: files-sharing-shareinfo', () => {
	beforeEach(async () => {
		await resetParityFilesStores();
		await resetParityShareStores();
		await setOutgoingS2SOnBothSides(true);
	});

	afterEach(async () => {
		resetSessionStore();
		await resetParityFilesStores();
		await resetParityShareStores();
		await setOutgoingS2SOnBothSides(true);
	});

	it('POST shareinfo with outgoing S2S off returns 404 wrapped error', async () => {
		await setOutgoingS2SOnBothSides(false);

		const result = await runParityCase({
			name: 'shareinfo-s2s-off',
			path: SHAREINFO_PATH,
			options: {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
				},
				body: JSON.stringify({ t: 'any-token' }),
			},
			compare: JSON_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}${SHAREINFO_PATH}`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
			},
			body: JSON.stringify({ t: 'any-token' }),
		});

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ data: [], status: 'error' });
	});

	it('POST shareinfo with good token returns 200 success wrap', async () => {
		const jar = await loginParitySession();
		const token = await createLinkShare(jar, { path: '/welcome.txt' });

		const result = await runParityCase({
			name: 'shareinfo-good-token',
			path: SHAREINFO_PATH,
			options: {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
				},
				body: JSON.stringify({ t: token }),
			},
			compare: {
				...JSON_COMPARE,
				includeBodyPaths: ['status', 'data.name', 'data.type', 'data.permissions'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}${SHAREINFO_PATH}`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
			},
			body: JSON.stringify({ t: token }),
		});

		expect(response.status).toBe(200);
		const body = await response.json() as { status: string; data: { name: string; type: string } };

		expect(body.status).toBe('success');
		expect(body.data.name).toBe('welcome.txt');
		expect(body.data.type).toBe('file');
	});

	it('POST shareinfo with bad password returns 403 wrapped error', async () => {
		const jar = await loginParitySession();
		const token = await createLinkShare(jar, { path: '/welcome.txt', password: 'secret' });

		const result = await runParityCase({
			name: 'shareinfo-bad-password',
			path: SHAREINFO_PATH,
			options: {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
				},
				body: JSON.stringify({ t: token, password: 'wrong' }),
			},
			compare: JSON_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}${SHAREINFO_PATH}`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
			},
			body: JSON.stringify({ t: token, password: 'wrong' }),
		});

		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ data: [], status: 'error' });
	});

	it('POST shareinfo with unknown token returns 404 wrapped error', async () => {
		const result = await runParityCase({
			name: 'shareinfo-unknown-token',
			path: SHAREINFO_PATH,
			options: {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
				},
				body: JSON.stringify({ t: 'does-not-exist-token' }),
			},
			compare: JSON_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}${SHAREINFO_PATH}`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
			},
			body: JSON.stringify({ t: 'does-not-exist-token' }),
		});

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ data: [], status: 'error' });
	});

	it('POST shareinfo without t returns raw 400', async () => {
		const result = await runParityCase({
			name: 'shareinfo-missing-t',
			path: SHAREINFO_PATH,
			options: {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
				},
				body: JSON.stringify({ password: 'secret' }),
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}${SHAREINFO_PATH}`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
			},
			body: JSON.stringify({ password: 'secret' }),
		});

		expect(response.status).toBe(400);
		expect(await response.text()).toBe('');
	});

	it('POST /index.php/apps/files_sharing/shareinfo matches the app route', async () => {
		const jar = await loginParitySession();
		const token = await createLinkShare(jar, { path: '/welcome.txt' });

		const result = await runParityCase({
			name: 'shareinfo-index-php-twin',
			path: '/index.php/apps/files_sharing/shareinfo',
			options: {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
				},
				body: JSON.stringify({ t: token }),
			},
			compare: {
				...JSON_COMPARE,
				includeBodyPaths: ['status', 'data.name', 'data.type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});
