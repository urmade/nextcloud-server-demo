import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from '@/src/server/auth/cookies';
import { resetSessionStore } from '@/src/server/auth/session-store';
import { defaultPublicPropfindBody } from '@/src/server/dav/public-handler';
import { setOutgoingServer2ServerShareEnabled } from '@/src/server/files_sharing/config';
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
const ADMIN_PASSWORD = process.env.NC_ADMIN_PASSWORD?.trim() || 'parity-test-password';

const DAV_XML_COMPARE = {
	contractHeaders: ['content-type'],
	davXmlBody: true,
};

const AUTH_XML_COMPARE = {
	contractHeaders: ['content-type', 'www-authenticate'],
	davXmlBody: true,
};

function basicAuthHeader(username: string, password = ''): string {
	return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

function propfindOptions(path: string, headers: Record<string, string> = {}) {
	return {
		method: 'PROPFIND',
		headers: {
			depth: '0',
			'content-type': 'application/xml; charset=utf-8',
			...headers,
		},
		body: defaultPublicPropfindBody(),
	};
}

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

describe('parity: files-sharing-public-dav', () => {
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

	it('open link PROPFIND on dav.Public#tree returns 207', async () => {
		const jar = await loginParitySession();
		const token = await createLinkShare(jar, { path: '/welcome.txt' });

		const result = await runParityCase({
			name: 'public-dav-v2-propfind-open-link',
			path: `/public.php/dav/files/${token}/`,
			options: propfindOptions(`/public.php/dav/files/${token}/`),
			compare: DAV_XML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET file on dav.Public#tree returns 200 binary', async () => {
		const jar = await loginParitySession();
		const token = await createLinkShare(jar, { path: '/welcome.txt' });

		const result = await runParityCase({
			name: 'public-dav-v2-get-file',
			path: `/public.php/dav/files/${token}`,
			options: {
				method: 'GET',
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const [legacy, newResponse] = await Promise.all([
			fetch(`${env.legacyBaseUrl}/public.php/dav/files/${token}`),
			fetch(`${env.newBaseUrl}/public.php/dav/files/${token}`),
		]);
		const binaryMismatches = compareBinarySnapshots(
			await snapshotBinaryResponse(legacy),
			await snapshotBinaryResponse(newResponse),
			['content-type'],
		);

		expect(binaryMismatches, formatParityMismatches(binaryMismatches)).toEqual([]);
	});

	it('unknown token returns Sabre 401 or 404 XML', async () => {
		const result = await runParityCase({
			name: 'public-dav-v2-unknown-token',
			path: '/public.php/dav/files/unknown-token-xyz/',
			options: propfindOptions('/public.php/dav/files/unknown-token-xyz/'),
			compare: DAV_XML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/public.php/dav/files/unknown-token-xyz/`, {
			method: 'PROPFIND',
			headers: {
				depth: '0',
				'content-type': 'application/xml; charset=utf-8',
			},
			body: defaultPublicPropfindBody(),
		});

		expect([401, 404]).toContain(response.status);
		expect(response.headers.get('content-type')).toContain('application/xml');
	});

	it('password share without credentials returns 401', async () => {
		const jar = await loginParitySession();
		const token = await createLinkShare(jar, { path: '/welcome.txt', password: 'secret' });

		const result = await runParityCase({
			name: 'public-dav-v2-password-no-creds',
			path: `/public.php/dav/files/${token}/`,
			options: propfindOptions(`/public.php/dav/files/${token}/`),
			compare: AUTH_XML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/public.php/dav/files/${token}/`, {
			method: 'PROPFIND',
			headers: {
				depth: '0',
				'content-type': 'application/xml; charset=utf-8',
			},
			body: defaultPublicPropfindBody(),
		});

		expect(response.status).toBe(401);
	});

	it('v2 PUT without AJAX and outgoing S2S off returns 401', async () => {
		await setOutgoingS2SOnBothSides(false);

		const jar = await loginParitySession();
		const token = await createLinkShare(jar, { path: '/welcome.txt' });

		const result = await runParityCase({
			name: 'public-dav-v2-put-no-ajax-s2s-off',
			path: `/public.php/dav/files/${token}/uploaded.bin`,
			options: {
				method: 'PUT',
				headers: {
					'content-type': 'application/octet-stream',
				},
				body: 'parity-upload',
			},
			compare: AUTH_XML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('legacy GET without AJAX and outgoing S2S off returns 401', async () => {
		await setOutgoingS2SOnBothSides(false);

		const jar = await loginParitySession();
		const token = await createLinkShare(jar, { path: '/welcome.txt' });

		const result = await runParityCase({
			name: 'public-dav-legacy-get-no-ajax-s2s-off',
			path: '/public.php/webdav/welcome.txt',
			options: {
				method: 'GET',
				headers: {
					authorization: basicAuthHeader(token),
				},
			},
			compare: AUTH_XML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('owner session cookie does not authenticate public DAV', async () => {
		const jar = await loginParitySession();
		const token = await createLinkShare(jar, { path: '/welcome.txt', password: 'secret' });

		const result = await runParityCase({
			name: 'public-dav-owner-cookie-not-auth',
			path: `/public.php/dav/files/${token}/`,
			options: propfindOptions(`/public.php/dav/files/${token}/`, {
				cookie: cookieJarToHeader(jar) ?? '',
			}),
			compare: AUTH_XML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});
