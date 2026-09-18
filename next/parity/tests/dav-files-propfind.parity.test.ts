import { describe, expect, it } from 'vitest';
import { defaultPropfindBody } from '@/src/server/dav/handler';
import { getDefaultDavUserId } from '@/src/server/dav/store';
import { formatParityMismatches, runParityCase } from '../harness';

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

describe('parity: dav files propfind', () => {
	it('PROPFIND depth 0 on dav.Collection#files returns 207 with oc:fileid and getetag', async () => {
		const result = await runParityCase({
			name: 'collection-files-propfind-depth-0',
			path: `/remote.php/dav/files/${ADMIN_USER}/`,
			options: propfindOptions(`/remote.php/dav/files/${ADMIN_USER}/`, '0', basicAuthHeader()),
			compare: DAV_XML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PROPFIND depth 0 on dav.Root#tree files prefix matches collection home', async () => {
		const result = await runParityCase({
			name: 'root-tree-files-propfind',
			path: `/remote.php/dav/files/${ADMIN_USER}/`,
			options: propfindOptions(`/remote.php/dav/files/${ADMIN_USER}/`, '0', basicAuthHeader()),
			compare: DAV_XML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PROPFIND depth 0 on dav.LegacyWebDAV#webdav matches files home', async () => {
		const result = await runParityCase({
			name: 'legacy-webdav-propfind-depth-0',
			path: '/remote.php/webdav/',
			options: propfindOptions('/remote.php/webdav/', '0', basicAuthHeader()),
			compare: DAV_XML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PROPFIND depth 0 on dav.LegacyWebDAV#files matches files home', async () => {
		const result = await runParityCase({
			name: 'legacy-files-propfind-depth-0',
			path: '/remote.php/files/',
			options: propfindOptions('/remote.php/files/', '0', basicAuthHeader()),
			compare: DAV_XML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('unauthenticated PROPFIND returns 401 with WWW-Authenticate', async () => {
		const result = await runParityCase({
			name: 'files-propfind-unauthenticated',
			path: `/remote.php/dav/files/${ADMIN_USER}/`,
			options: propfindOptions(`/remote.php/dav/files/${ADMIN_USER}/`, '0'),
			compare: {
				contractHeaders: ['content-type', 'www-authenticate'],
				davXmlBody: true,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PROPFIND on another user home is empty at depth 1 (validation)', async () => {
		const result = await runParityCase({
			name: 'files-propfind-other-user-empty',
			path: '/remote.php/dav/files/otheruser/',
			options: propfindOptions('/remote.php/dav/files/otheruser/', '1', basicAuthHeader()),
			compare: DAV_XML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PROPFIND on missing file returns 404 (validation)', async () => {
		const result = await runParityCase({
			name: 'files-propfind-missing-file',
			path: `/remote.php/dav/files/${ADMIN_USER}/missing.txt`,
			options: propfindOptions(`/remote.php/dav/files/${ADMIN_USER}/missing.txt`, '0', basicAuthHeader()),
			compare: {
				contractHeaders: ['content-type'],
				davXmlBody: true,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});
