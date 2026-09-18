import { describe, expect, it } from 'vitest';
import { formatParityMismatches, runParityCase } from '../harness';
import { cookieJarToHeader } from '../helpers/cookies';
import {
	loginParitySession,
	OCS_JSON_HEADERS,
	OCS_META_PATHS,
} from '../helpers/session';

describe('parity: core unified search', () => {
	it('GET /ocs/v2.php/search/providers requires auth (401)', async () => {
		const result = await runParityCase({
			name: 'unified-search-providers-unauth',
			path: '/ocs/v2.php/search/providers?format=json',
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

	it('GET /ocs/v2.php/search/providers happy path', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'unified-search-providers-happy',
			path: '/ocs/v2.php/search/providers?format=json',
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type', 'etag'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data[0].id',
					'ocs.data[0].name',
					'ocs.data[0].filters.term',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/search/providers/{providerId}/search requires auth (401)', async () => {
		const result = await runParityCase({
			name: 'unified-search-search-unauth',
			path: '/ocs/v2.php/search/providers/parity-users/search?format=json&term=ali',
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

	it('GET /ocs/v2.php/search/providers/{providerId}/search happy path', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'unified-search-search-happy',
			path: '/ocs/v2.php/search/providers/parity-users/search?format=json&term=ali',
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
					'ocs.data.name',
					'ocs.data.isPaginated',
					'ocs.data.entries[0].title',
					'ocs.data.entries[0].subline',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/search/providers/{providerId}/search rejects missing filters (validation)', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'unified-search-search-no-filters',
			path: '/ocs/v2.php/search/providers/parity-users/search?format=json',
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
					'ocs.data',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});
