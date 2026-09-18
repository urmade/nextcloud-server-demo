import { describe, expect, it } from 'vitest';
import { defaultPropfindBody } from '@/src/server/dav/handler';
import { getDefaultDavUserId } from '@/src/server/dav/store';
import { formatParityMismatches, runParityCase } from '../harness';

const ADMIN_USER = getDefaultDavUserId();
const ADMIN_PASSWORD = process.env.NC_ADMIN_PASSWORD?.trim() || 'parity-test-password';
const UPLOAD_FOLDER = `parity-upload-${Date.now().toString(36)}`;
const ASSEMBLED_FILE = `${UPLOAD_FOLDER}.txt`;
const ORIGIN = process.env.NEW_BASE_URL?.replace(/\/$/, '') ?? 'http://127.0.0.1:3100';

function basicAuthHeader(username = ADMIN_USER, password = ADMIN_PASSWORD): string {
	return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

const STATUS_ONLY_COMPARE = {};

const DAV_XML_COMPARE = {
	contractHeaders: ['content-type'],
	davXmlBody: true,
};

describe('parity: dav uploads collection', () => {
	it('MKCOL on dav.Collection#uploads creates staging folder', async () => {
		const result = await runParityCase({
			name: 'uploads-mkcol-happy',
			path: `/remote.php/dav/uploads/${ADMIN_USER}/${UPLOAD_FOLDER}`,
			options: {
				method: 'MKCOL',
				headers: {
					authorization: basicAuthHeader(),
				},
			},
			compare: STATUS_ONLY_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PUT chunk on dav.Collection#uploads stores part 1', async () => {
		const result = await runParityCase({
			name: 'uploads-put-chunk-1',
			path: `/remote.php/dav/uploads/${ADMIN_USER}/${UPLOAD_FOLDER}/1`,
			options: {
				method: 'PUT',
				headers: {
					authorization: basicAuthHeader(),
					'content-type': 'application/octet-stream',
				},
				body: 'hello ',
			},
			compare: STATUS_ONLY_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PUT chunk on dav.Collection#uploads stores part 2', async () => {
		const result = await runParityCase({
			name: 'uploads-put-chunk-2',
			path: `/remote.php/dav/uploads/${ADMIN_USER}/${UPLOAD_FOLDER}/2`,
			options: {
				method: 'PUT',
				headers: {
					authorization: basicAuthHeader(),
					'content-type': 'application/octet-stream',
				},
				body: 'world',
			},
			compare: STATUS_ONLY_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('MOVE .file on dav.Collection#uploads assembles into files home', async () => {
		const result = await runParityCase({
			name: 'uploads-move-assemble',
			path: `/remote.php/dav/uploads/${ADMIN_USER}/${UPLOAD_FOLDER}/.file`,
			options: {
				method: 'MOVE',
				headers: {
					authorization: basicAuthHeader(),
					destination: `${ORIGIN}/remote.php/dav/files/${ADMIN_USER}/${ASSEMBLED_FILE}`,
				},
			},
			compare: STATUS_ONLY_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PROPFIND depth 0 confirms assembled file in files home', async () => {
		const result = await runParityCase({
			name: 'uploads-assembled-file-propfind',
			path: `/remote.php/dav/files/${ADMIN_USER}/${ASSEMBLED_FILE}`,
			options: {
				method: 'PROPFIND',
				headers: {
					authorization: basicAuthHeader(),
					depth: '0',
					'content-type': 'application/xml; charset=utf-8',
				},
				body: defaultPropfindBody(),
			},
			compare: DAV_XML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('unauthenticated MKCOL on uploads returns 401', async () => {
		const result = await runParityCase({
			name: 'uploads-mkcol-unauthenticated',
			path: `/remote.php/dav/uploads/${ADMIN_USER}/unauth-folder`,
			options: {
				method: 'MKCOL',
			},
			compare: {
				contractHeaders: ['content-type', 'www-authenticate'],
				davXmlBody: true,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('MKCOL on another user upload home returns Forbidden', async () => {
		const result = await runParityCase({
			name: 'uploads-mkcol-other-user-forbidden',
			path: '/remote.php/dav/uploads/otheruser/forbidden-folder',
			options: {
				method: 'MKCOL',
				headers: {
					authorization: basicAuthHeader(),
				},
			},
			compare: DAV_XML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('MOVE .file without Destination header returns BadRequest', async () => {
		const folder = `${UPLOAD_FOLDER}-move-validation`;
		const mkcol = await runParityCase({
			name: 'uploads-move-validation-mkcol',
			path: `/remote.php/dav/uploads/${ADMIN_USER}/${folder}`,
			options: {
				method: 'MKCOL',
				headers: {
					authorization: basicAuthHeader(),
				},
			},
			compare: STATUS_ONLY_COMPARE,
		});
		expect(mkcol.mismatches, formatParityMismatches(mkcol.mismatches)).toEqual([]);

		const put = await runParityCase({
			name: 'uploads-move-validation-put',
			path: `/remote.php/dav/uploads/${ADMIN_USER}/${folder}/1`,
			options: {
				method: 'PUT',
				headers: {
					authorization: basicAuthHeader(),
				},
				body: 'chunk',
			},
			compare: STATUS_ONLY_COMPARE,
		});
		expect(put.mismatches, formatParityMismatches(put.mismatches)).toEqual([]);

		const result = await runParityCase({
			name: 'uploads-move-missing-destination',
			path: `/remote.php/dav/uploads/${ADMIN_USER}/${folder}/.file`,
			options: {
				method: 'MOVE',
				headers: {
					authorization: basicAuthHeader(),
				},
			},
			compare: DAV_XML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});
