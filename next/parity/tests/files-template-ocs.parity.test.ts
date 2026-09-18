import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetSessionStore } from '@/src/server/auth/session-store';
import { formatParityMismatches, runParityCase } from '../harness';
import { cookieJarToHeader } from '../helpers/cookies';
import { resetParityFilesStores } from '../helpers/files';
import { loginParitySession, OCS_JSON_HEADERS, OCS_META_PATHS } from '../helpers/session';

const LIST_PATH = '/ocs/v2.php/apps/files/api/v1/templates?format=json';
const CREATE_PATH = '/ocs/v2.php/apps/files/api/v1/templates/create?format=json';
const PATH_PATH = '/ocs/v2.php/apps/files/api/v1/templates/path?format=json';
const FIELDS_PATH = '/ocs/v2.php/apps/files/api/v1/templates/fields/99999?format=json';

const OCS_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: OCS_META_PATHS,
};

const LIST_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: [
		...OCS_META_PATHS,
		'ocs.data',
	],
};

const FIELDS_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: [
		...OCS_META_PATHS,
		'ocs.data',
	],
};

const CREATE_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: [
		...OCS_META_PATHS,
		'ocs.data.basename',
		'ocs.data.fileid',
		'ocs.data.filename',
		'ocs.data.mime',
		'ocs.data.type',
	],
};

const PATH_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: [
		...OCS_META_PATHS,
		'ocs.data.template_path',
		'ocs.data.templates',
	],
};

describe('parity: files-template-ocs', () => {
	beforeEach(async () => {
		await resetParityFilesStores();
	});

	afterEach(async () => {
		resetSessionStore();
		await resetParityFilesStores();
	});

	it('GET templates requires auth (401)', async () => {
		const result = await runParityCase({
			name: 'template-list-unauth',
			path: LIST_PATH,
			options: {
				headers: OCS_JSON_HEADERS,
			},
			compare: OCS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET templates returns empty creator array', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'template-list-happy',
			path: LIST_PATH,
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: LIST_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET template fields for unknown fileId returns empty array', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'template-fields-unknown',
			path: FIELDS_PATH,
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: FIELDS_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST template create writes empty file', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'template-create-happy',
			path: CREATE_PATH,
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({
					filePath: 'from-template.txt',
				}),
			},
			compare: CREATE_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST template create rejects duplicate filePath', async () => {
		const jar = await loginParitySession();

		const headers = {
			...OCS_JSON_HEADERS,
			'content-type': 'application/json',
			cookie: cookieJarToHeader(jar) ?? '',
		};

		await runParityCase({
			name: 'template-create-seed',
			path: CREATE_PATH,
			options: {
				method: 'POST',
				headers,
				body: JSON.stringify({
					filePath: 'duplicate-template.txt',
				}),
			},
			compare: CREATE_COMPARE,
		});

		const result = await runParityCase({
			name: 'template-create-duplicate',
			path: CREATE_PATH,
			options: {
				method: 'POST',
				headers,
				body: JSON.stringify({
					filePath: 'duplicate-template.txt',
				}),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.meta.message',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST template path initializes directory', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'template-path-happy',
			path: PATH_PATH,
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({
					templatePath: 'Templates',
					copySystemTemplates: false,
				}),
			},
			compare: PATH_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});
