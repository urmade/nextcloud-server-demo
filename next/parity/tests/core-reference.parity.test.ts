import { describe, expect, it } from 'vitest';
import { formatParityMismatches, runParityCase } from '../harness';
import { cookieJarToHeader } from '../helpers/cookies';
import {
	loginParitySession,
	OCS_JSON_HEADERS,
	OCS_META_PATHS,
} from '../helpers/session';
import {
	PARITY_DISCOVERABLE_PROVIDER_ID,
	PARITY_REFERENCE_URL,
	PARITY_SHARING_TOKEN,
} from '@/src/server/reference/api';

const EXTRACT_TEXT = `See ${PARITY_REFERENCE_URL} for details`;

describe('parity: core reference API', () => {
	it('POST /ocs/v2.php/references/extract requires auth (401)', async () => {
		const result = await runParityCase({
			name: 'reference-extract-unauth',
			path: '/ocs/v2.php/references/extract?format=json',
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
				},
				body: JSON.stringify({ text: EXTRACT_TEXT }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/references/extract happy path', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'reference-extract-happy',
			path: '/ocs/v2.php/references/extract?format=json',
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({ text: EXTRACT_TEXT, resolve: false, limit: 1 }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					`ocs.data.references["${PARITY_REFERENCE_URL}"]`,
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/references/extract rejects empty text (validation)', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'reference-extract-empty',
			path: '/ocs/v2.php/references/extract?format=json',
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({ text: '' }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.references',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/references/extractPublic happy path without auth', async () => {
		const result = await runParityCase({
			name: 'reference-extract-public-happy',
			path: '/ocs/v2.php/references/extractPublic?format=json',
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
				},
				body: JSON.stringify({
					text: EXTRACT_TEXT,
					sharingToken: PARITY_SHARING_TOKEN,
					resolve: true,
					limit: 1,
				}),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					`ocs.data.references["${PARITY_REFERENCE_URL}"].richObjectType`,
					`ocs.data.references["${PARITY_REFERENCE_URL}"].openGraphObject.name`,
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/references/extractPublic rejects empty text (validation)', async () => {
		const result = await runParityCase({
			name: 'reference-extract-public-empty',
			path: '/ocs/v2.php/references/extractPublic?format=json',
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
				},
				body: JSON.stringify({
					text: '',
					sharingToken: PARITY_SHARING_TOKEN,
				}),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.references',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/references/providers requires auth (401)', async () => {
		const result = await runParityCase({
			name: 'reference-providers-unauth',
			path: '/ocs/v2.php/references/providers?format=json',
			options: {
				headers: OCS_JSON_HEADERS,
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/references/providers happy path', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'reference-providers-happy',
			path: '/ocs/v2.php/references/providers?format=json',
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data[0].id',
					'ocs.data[0].title',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PUT /ocs/v2.php/references/provider/{providerId} requires auth (401)', async () => {
		const result = await runParityCase({
			name: 'reference-touch-unauth',
			path: `/ocs/v2.php/references/provider/${PARITY_DISCOVERABLE_PROVIDER_ID}?format=json`,
			options: {
				method: 'PUT',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
				},
				body: JSON.stringify({ timestamp: 1_700_000_000 }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PUT /ocs/v2.php/references/provider/{providerId} happy path', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'reference-touch-happy',
			path: `/ocs/v2.php/references/provider/${PARITY_DISCOVERABLE_PROVIDER_ID}?format=json`,
			options: {
				method: 'PUT',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({ timestamp: 1_700_000_000 }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.success',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PUT /ocs/v2.php/references/provider/{providerId} rejects unknown provider (validation)', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'reference-touch-unknown',
			path: '/ocs/v2.php/references/provider/unknown-provider?format=json',
			options: {
				method: 'PUT',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({ timestamp: 1_700_000_000 }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.success',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/references/resolve requires auth (401)', async () => {
		const result = await runParityCase({
			name: 'reference-resolve-one-unauth',
			path: `/ocs/v2.php/references/resolve?format=json&reference=${encodeURIComponent(PARITY_REFERENCE_URL)}`,
			options: {
				headers: OCS_JSON_HEADERS,
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/references/resolve happy path', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'reference-resolve-one-happy',
			path: `/ocs/v2.php/references/resolve?format=json&reference=${encodeURIComponent(PARITY_REFERENCE_URL)}`,
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type', 'cache-control'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					`ocs.data.references["${PARITY_REFERENCE_URL}"].richObjectType`,
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/references/resolve rejects unknown reference (validation)', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'reference-resolve-one-unknown',
			path: '/ocs/v2.php/references/resolve?format=json&reference=https%3A%2F%2Funknown.example%2Fpage',
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type', 'cache-control'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.references["https://unknown.example/page"]',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/references/resolve requires auth (401)', async () => {
		const result = await runParityCase({
			name: 'reference-resolve-many-unauth',
			path: '/ocs/v2.php/references/resolve?format=json',
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
				},
				body: JSON.stringify({ references: [PARITY_REFERENCE_URL], limit: 1 }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/references/resolve happy path', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'reference-resolve-many-happy',
			path: '/ocs/v2.php/references/resolve?format=json',
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({ references: [PARITY_REFERENCE_URL], limit: 1 }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					`ocs.data.references["${PARITY_REFERENCE_URL}"].openGraphObject.name`,
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/references/resolve rejects unknown reference (validation)', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'reference-resolve-many-unknown',
			path: '/ocs/v2.php/references/resolve?format=json',
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({ references: ['https://unknown.example/page'], limit: 1 }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.references["https://unknown.example/page"]',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/references/resolvePublic happy path without auth', async () => {
		const result = await runParityCase({
			name: 'reference-resolve-one-public-happy',
			path: `/ocs/v2.php/references/resolvePublic?format=json&reference=${encodeURIComponent(PARITY_REFERENCE_URL)}&sharingToken=${PARITY_SHARING_TOKEN}`,
			options: {
				headers: OCS_JSON_HEADERS,
			},
			compare: {
				contractHeaders: ['content-type', 'cache-control'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					`ocs.data.references["${PARITY_REFERENCE_URL}"].richObjectType`,
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/references/resolvePublic rejects unknown reference (validation)', async () => {
		const result = await runParityCase({
			name: 'reference-resolve-one-public-unknown',
			path: '/ocs/v2.php/references/resolvePublic?format=json&reference=https%3A%2F%2Funknown.example%2Fpage&sharingToken=parity-share-token',
			options: {
				headers: OCS_JSON_HEADERS,
			},
			compare: {
				contractHeaders: ['content-type', 'cache-control'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.references["https://unknown.example/page"]',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/references/resolvePublic happy path without auth', async () => {
		const result = await runParityCase({
			name: 'reference-resolve-public-happy',
			path: '/ocs/v2.php/references/resolvePublic?format=json',
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
				},
				body: JSON.stringify({
					references: [PARITY_REFERENCE_URL],
					sharingToken: PARITY_SHARING_TOKEN,
					limit: 1,
				}),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					`ocs.data.references["${PARITY_REFERENCE_URL}"].openGraphObject.name`,
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/references/resolvePublic rejects unknown reference (validation)', async () => {
		const result = await runParityCase({
			name: 'reference-resolve-public-unknown',
			path: '/ocs/v2.php/references/resolvePublic?format=json',
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
				},
				body: JSON.stringify({
					references: ['https://unknown.example/page'],
					sharingToken: PARITY_SHARING_TOKEN,
					limit: 1,
				}),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.references["https://unknown.example/page"]',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});
