import { beforeEach, describe, expect, it } from 'vitest';
import { defaultPropfindBody } from '@/src/server/dav/handler';
import { getDefaultDavUserId } from '@/src/server/dav/store';
import { getParityEnv } from '../env';
import { formatParityMismatches, runParityCase } from '../harness';
import { compareBinarySnapshots, snapshotBinaryResponse } from '../helpers/binary';
import { resetParityTreeExtrasStores } from '../helpers/dav-tree-extras';

const ADMIN_USER = getDefaultDavUserId();
const ADMIN_PASSWORD = process.env.NC_ADMIN_PASSWORD?.trim() || 'parity-test-password';

function basicAuthHeader(username = ADMIN_USER, password = ADMIN_PASSWORD): string {
	return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

function propfindOptions(path: string, depth: '0' | '1', authHeader?: string) {
	return {
		method: 'PROPFIND',
		headers: {
			...(authHeader ? { authorization: authHeader } : {}),
			depth,
			'content-type': 'application/xml; charset=utf-8',
		},
		body: defaultPropfindBody(),
	};
}

const DAV_XML_COMPARE = {
	contractHeaders: ['content-type'],
	davXmlBody: true,
};

const DAV_XML_AUTH_COMPARE = {
	contractHeaders: ['content-type', 'www-authenticate'],
	davXmlBody: true,
};

describe('parity: dav tree extras', () => {
	beforeEach(async () => {
		await resetParityTreeExtrasStores();
	});

	it('authenticated GET avatar png returns 200 (dav.Collection#avatars)', async () => {
		const env = getParityEnv();
		const path = `/remote.php/dav/avatars/${ADMIN_USER}/64.png`;
		const options = {
			method: 'GET',
			headers: { authorization: basicAuthHeader() },
		};

		const [legacyResponse, newResponse] = await Promise.all([
			fetch(`${env.legacyBaseUrl}${path}`, options),
			fetch(`${env.newBaseUrl}${path}`, options),
		]);

		const [legacySnapshot, newSnapshot] = await Promise.all([
			snapshotBinaryResponse(legacyResponse),
			snapshotBinaryResponse(newResponse),
		]);

		const mismatches = compareBinarySnapshots(
			legacySnapshot,
			newSnapshot,
			['content-type'],
			Object.fromEntries(legacyResponse.headers.entries()),
			Object.fromEntries(newResponse.headers.entries()),
		);

		expect(mismatches, formatParityMismatches(mismatches)).toEqual([]);
	});

	it('authenticated GET missing avatar returns 404 (dav.Collection#avatars)', async () => {
		const result = await runParityCase({
			name: 'avatars-missing-user',
			path: '/remote.php/dav/avatars/no-such-parity-user/64.png',
			options: {
				method: 'GET',
				headers: { authorization: basicAuthHeader() },
			},
			compare: {
				contractHeaders: ['content-type'],
				davXmlBody: true,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('unauthenticated PROPFIND on comments returns 401 (dav.Collection#comments)', async () => {
		const result = await runParityCase({
			name: 'comments-unauth',
			path: '/remote.php/dav/comments/',
			options: propfindOptions('/remote.php/dav/comments/', '0'),
			compare: DAV_XML_AUTH_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('authenticated PROPFIND on systemtags returns 207 (dav.Collection#systemtags)', async () => {
		const result = await runParityCase({
			name: 'systemtags-propfind',
			path: '/remote.php/dav/systemtags/',
			options: propfindOptions('/remote.php/dav/systemtags/', '0', basicAuthHeader()),
			compare: DAV_XML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('authenticated PROPFIND on systemtags-relations files returns 207 (dav.Collection#systemtags-relations)', async () => {
		const result = await runParityCase({
			name: 'systemtags-relations-files',
			path: '/remote.php/dav/systemtags-relations/files/1001/',
			options: propfindOptions('/remote.php/dav/systemtags-relations/files/1001/', '0', basicAuthHeader()),
			compare: DAV_XML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('unauthenticated PROPFIND on systemtags-assigned returns 401 (dav.Collection#systemtags-assigned)', async () => {
		const result = await runParityCase({
			name: 'systemtags-assigned-unauth',
			path: '/remote.php/dav/systemtags-assigned/',
			options: propfindOptions('/remote.php/dav/systemtags-assigned/', '0'),
			compare: DAV_XML_AUTH_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('authenticated GET apple provisioning over HTTP returns 200 plaintext (dav.Collection#apple-provisioning)', async () => {
		const result = await runParityCase({
			name: 'apple-provisioning-http',
			path: '/remote.php/dav/provisioning/apple-provisioning.mobileconfig',
			options: {
				method: 'GET',
				headers: { authorization: basicAuthHeader() },
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});
