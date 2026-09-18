import { afterEach, describe, expect, it } from 'vitest';
import {
	PARITY_BOARD_EMPTY_ID,
	PARITY_BOARD_ID,
	PARITY_DECK_PROVIDER_ID,
	PARITY_TEAM_ALPHA_ID,
	PARITY_TEAM_SECRET_ID,
} from '@/src/server/teams/catalog';
import { formatParityMismatches, runParityCase } from '../harness';
import { cookieJarToHeader } from '../helpers/cookies';
import { loginParitySession, OCS_JSON_HEADERS, OCS_META_PATHS } from '../helpers/session';

describe('parity: core teams', () => {
	afterEach(() => {
		// Fixture catalog is static; no store reset required.
	});

	it('GET list-teams requires auth (401)', async () => {
		const result = await runParityCase({
			name: 'teams-list-unauth',
			path: `/ocs/v2.php/teams/resources/${PARITY_DECK_PROVIDER_ID}/${PARITY_BOARD_ID}?format=json`,
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

	it('GET list-teams returns teams for accessible resource (happy path)', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'teams-list-happy',
			path: `/ocs/v2.php/teams/resources/${PARITY_DECK_PROVIDER_ID}/${PARITY_BOARD_ID}?format=json`,
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
					'ocs.data.teams[0].teamId',
					'ocs.data.teams[0].displayName',
					'ocs.data.teams[0].resources[0].id',
					'ocs.data.teams[0].resources[0].label',
					'ocs.data.teams[0].resources[0].provider.id',
					'ocs.data.teams[1].teamId',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET list-teams returns empty teams for resource with no shares (validation)', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'teams-list-empty-resource',
			path: `/ocs/v2.php/teams/resources/${PARITY_DECK_PROVIDER_ID}/${PARITY_BOARD_EMPTY_ID}?format=json`,
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
					'ocs.data.teams',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET list-teams returns 500 for unknown provider (validation)', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'teams-list-unknown-provider',
			path: `/ocs/v2.php/teams/resources/unknown-provider/${PARITY_BOARD_ID}?format=json`,
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET resolve-one requires auth (401)', async () => {
		const result = await runParityCase({
			name: 'teams-resolve-unauth',
			path: `/ocs/v2.php/teams/${PARITY_TEAM_ALPHA_ID}/resources?format=json`,
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

	it('GET resolve-one returns team resources (happy path)', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'teams-resolve-happy',
			path: `/ocs/v2.php/teams/${PARITY_TEAM_ALPHA_ID}/resources?format=json`,
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
					'ocs.data.resources[0].id',
					'ocs.data.resources[0].label',
					'ocs.data.resources[0].provider.id',
					'ocs.data.resources[0].iconEmoji',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET resolve-one returns empty resources for non-member team (validation)', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'teams-resolve-non-member',
			path: `/ocs/v2.php/teams/${PARITY_TEAM_SECRET_ID}/resources?format=json`,
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
					'ocs.data.resources',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});
