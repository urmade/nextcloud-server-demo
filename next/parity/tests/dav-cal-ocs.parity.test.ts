import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getParityEnv } from '../env';
import { formatParityMismatches, runParityCase } from '../harness';
import { cookieJarToHeader } from '../helpers/cookies';
import { resetParityCalOcsStores } from '../helpers/dav-cal-ocs';
import { loginParitySession, OCS_JSON_HEADERS, OCS_META_PATHS } from '../helpers/session';

const UPCOMING_PATH = '/ocs/v2.php/apps/dav/api/v1/events/upcoming?format=json';
const PENDING_PATH = '/ocs/v2.php/apps/dav/api/v1/federated_calendars/pending?format=json';

function pendingActionPath(id: number): string {
	return `/ocs/v2.php/apps/dav/api/v1/federated_calendars/pending/${id}?format=json`;
}

describe('parity: dav cal-ocs', () => {
	beforeEach(async () => {
		await resetParityCalOcsStores();
	});

	afterEach(async () => {
		await resetParityCalOcsStores();
	});

	it('GET upcoming unauthenticated returns 401/997', async () => {
		const result = await runParityCase({
			name: 'dav-upcoming-events-get-unauthenticated',
			path: UPCOMING_PATH,
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

	it('GET upcoming authenticated returns 200 with empty events', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'dav-upcoming-events-get-events',
			path: UPCOMING_PATH,
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
					'ocs.data.events',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}${UPCOMING_PATH}`, {
			headers: {
				...OCS_JSON_HEADERS,
				cookie: cookieJarToHeader(jar) ?? '',
			},
		});
		const body = await response.json() as { ocs: { data: { events: unknown[] } } };

		expect(body.ocs.data.events).toEqual([]);
	});

	it('GET pending authenticated returns 200 with empty list', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'dav-federated_calendar-get-pending',
			path: PENDING_PATH,
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

	it('POST accept unknown id returns 404 null', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'dav-federated_calendar-accept',
			path: pendingActionPath(99999),
			options: {
				method: 'POST',
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

	it('DELETE decline unknown id returns 404 null', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'dav-federated_calendar-decline',
			path: pendingActionPath(99999),
			options: {
				method: 'DELETE',
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
});
