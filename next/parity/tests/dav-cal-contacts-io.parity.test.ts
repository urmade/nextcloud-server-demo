import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getParityEnv } from '../env';
import { formatParityMismatches, runParityCase } from '../harness';
import { compareBinarySnapshots, snapshotBinaryResponse } from '../helpers/binary';
import { cookieJarToHeader } from '../helpers/cookies';
import { resetParityAddressBooksStores } from '../helpers/dav-addressbooks';
import { resetParityCalendarsStores, seedParityUserCalendar } from '../helpers/dav-calendars';
import { loginParitySession, OCS_JSON_HEADERS, OCS_META_PATHS } from '../helpers/session';

const EXPORT_PATH = '/ocs/v2.php/calendar/export?format=json';
const CALENDAR_IMPORT_PATH = '/ocs/v2.php/calendar/import?format=json';
const CONTACTS_IMPORT_PATH = '/ocs/v2.php/contacts/import?format=json';

const TEST_CALENDAR = 'parity-export-cal';
const TEST_BOOK = 'parity-import-book';
const SAMPLE_ICS = [
	'BEGIN:VCALENDAR',
	'VERSION:2.0',
	'PRODID:-//Nextcloud//Parity//EN',
	'BEGIN:VEVENT',
	'UID:parity-export-event',
	'DTSTAMP:20260101T120000Z',
	'SUMMARY:Parity export',
	'END:VEVENT',
	'END:VCALENDAR',
].join('\r\n');

function postJson(path: string, body: Record<string, unknown>, jar?: Record<string, string>) {
	return {
		method: 'POST',
		headers: {
			...OCS_JSON_HEADERS,
			'content-type': 'application/json',
			...(jar ? { cookie: cookieJarToHeader(jar) ?? '' } : {}),
		},
		body: JSON.stringify(body),
	};
}

describe('parity: dav cal-contacts-io', () => {
	beforeEach(async () => {
		await resetParityCalendarsStores();
		await resetParityAddressBooksStores();
	});

	afterEach(async () => {
		await resetParityCalendarsStores();
		await resetParityAddressBooksStores();
	});

	it('POST calendar export unauthenticated returns 401/997 (dav-calendar_export-export)', async () => {
		const result = await runParityCase({
			name: 'dav-calendar-export-unauth',
			path: EXPORT_PATH,
			options: postJson(EXPORT_PATH, { target: TEST_CALENDAR }),
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST calendar import unauthenticated returns 401/997 (dav-calendar_import-import)', async () => {
		const result = await runParityCase({
			name: 'dav-calendar-import-unauth',
			path: CALENDAR_IMPORT_PATH,
			options: postJson(CALENDAR_IMPORT_PATH, {
				transaction: 'tx-unauth',
				target: TEST_CALENDAR,
				data: SAMPLE_ICS,
			}),
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST contacts import unauthenticated returns 401/997 (dav-contacts_import-import)', async () => {
		const result = await runParityCase({
			name: 'dav-contacts-import-unauth',
			path: CONTACTS_IMPORT_PATH,
			options: postJson(CONTACTS_IMPORT_PATH, {
				transaction: 'tx-unauth',
				target: TEST_BOOK,
				data: 'BEGIN:VCARD\nVERSION:3.0\nFN:Parity\nEND:VCARD\n',
			}),
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST calendar export missing calendar returns 400 (dav-calendar_export-export)', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'dav-calendar-export-missing-calendar',
			path: EXPORT_PATH,
			options: postJson(EXPORT_PATH, { target: 'missing-calendar' }, jar),
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.error',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST calendar import missing calendar returns 400 (dav-calendar_import-import)', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'dav-calendar-import-missing-calendar',
			path: CALENDAR_IMPORT_PATH,
			options: postJson(CALENDAR_IMPORT_PATH, {
				transaction: 'tx-missing-cal',
				target: 'missing-calendar',
				data: SAMPLE_ICS,
			}, jar),
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.error',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST contacts import missing book returns 400 (dav-contacts_import-import)', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'dav-contacts-import-missing-book',
			path: CONTACTS_IMPORT_PATH,
			options: postJson(CONTACTS_IMPORT_PATH, {
				transaction: 'tx-missing-book',
				target: 'missing-book',
				data: 'BEGIN:VCARD\nVERSION:3.0\nFN:Parity\nEND:VCARD\n',
			}, jar),
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.error',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST calendar export returns 200 text/calendar (dav-calendar_export-export)', async () => {
		const env = getParityEnv();
		const jar = await loginParitySession();

		await seedParityUserCalendar('admin', TEST_CALENDAR, 'Export calendar');

		const options = postJson(EXPORT_PATH, { target: TEST_CALENDAR }, jar);
		const [legacyResult, legacyResponse, newResponse] = await Promise.all([
			runParityCase({
				name: 'dav-calendar-export-success',
				path: EXPORT_PATH,
				options,
				compare: {
					contractHeaders: ['content-type'],
				},
			}),
			fetch(`${env.legacyBaseUrl}${EXPORT_PATH}`, { ...options, redirect: 'manual' }),
			fetch(`${env.newBaseUrl}${EXPORT_PATH}`, { ...options, redirect: 'manual' }),
		]);

		expect(legacyResult.mismatches, formatParityMismatches(legacyResult.mismatches)).toEqual([]);

		const [legacySnapshot, newSnapshot] = await Promise.all([
			snapshotBinaryResponse(legacyResponse),
			snapshotBinaryResponse(newResponse),
		]);

		const mismatches = compareBinarySnapshots(legacySnapshot, newSnapshot);

		expect(mismatches, mismatches.map((m) => m.message).join('\n')).toEqual([]);
		expect(legacySnapshot.contentType?.toLowerCase()).toContain('text/calendar');
	});
});
