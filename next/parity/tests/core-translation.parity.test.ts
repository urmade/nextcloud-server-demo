import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleTranslationTranslate } from '@/src/server/translation/api';
import { compareParityResponses, snapshotResponse } from '../compare';
import { formatParityMismatches, runParityCase } from '../harness';
import { fetchLegacyMockSnapshot } from '../legacy-mock/adapter';
import { cookieJarToHeader } from '../helpers/cookies';
import { loginParitySession, OCS_JSON_HEADERS, OCS_META_PATHS } from '../helpers/session';

const TRANSLATE_BODY = {
	text: 'hello',
	fromLanguage: 'en',
	toLanguage: 'de',
};

describe('parity: core translation', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('GET /ocs/v2.php/translation/languages is public (200 without auth)', async () => {
		const result = await runParityCase({
			name: 'translation-languages-public',
			path: '/ocs/v2.php/translation/languages?format=json',
			options: {
				headers: OCS_JSON_HEADERS,
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.languages[0].from',
					'ocs.data.languages[0].to',
					'ocs.data.languageDetection',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/translation/languages happy path with session', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'translation-languages-happy',
			path: '/ocs/v2.php/translation/languages?format=json',
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
					'ocs.data.languages[0].fromLabel',
					'ocs.data.languages[1].toLabel',
					'ocs.data.languageDetection',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/translation/translate is public (200 without auth)', async () => {
		const result = await runParityCase({
			name: 'translation-translate-public',
			path: '/ocs/v2.php/translation/translate?format=json',
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
				},
				body: JSON.stringify(TRANSLATE_BODY),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.text',
					'ocs.data.from',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/translation/translate happy path with session', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'translation-translate-happy',
			path: '/ocs/v2.php/translation/translate?format=json',
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify(TRANSLATE_BODY),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.text',
					'ocs.data.from',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/translation/translate rejects missing provider (validation)', async () => {
		vi.stubEnv('NC_PARITY_TRANSLATION_PROVIDER', 'false');

		const path = '/ocs/v2.php/translation/translate?format=json';
		const options = {
			method: 'POST',
			headers: {
				...OCS_JSON_HEADERS,
				'content-type': 'application/json',
			},
			body: JSON.stringify(TRANSLATE_BODY),
		};
		const legacySnapshot = await fetchLegacyMockSnapshot(path, options);
		const request = new Request(`http://127.0.0.1:3100${path}`, options);
		const response = await handleTranslationTranslate(request);
		const newSnapshot = snapshotResponse(response, await response.text());
		const mismatches = compareParityResponses(legacySnapshot, newSnapshot, {
			contractHeaders: ['content-type'],
			includeBodyPaths: [
				...OCS_META_PATHS,
				'ocs.data.message',
			],
		});

		expect(mismatches, formatParityMismatches(mismatches)).toEqual([]);
	});
});
