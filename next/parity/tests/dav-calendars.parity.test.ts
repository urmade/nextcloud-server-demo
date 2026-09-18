import { beforeEach, describe, expect, it } from 'vitest';
import { defaultPropfindBody } from '@/src/server/dav/handler';
import { getDefaultDavUserId } from '@/src/server/dav/store';
import { formatParityMismatches, runParityCase } from '../harness';
import {
	resetParityCalendarsStores,
	seedParityPublicCalendar,
	seedParityRemoteCalendar,
	seedParitySystemResourceCalendar,
	seedParitySystemRoomCalendar,
	seedParityUserCalendar,
} from '../helpers/dav-calendars';

const ADMIN_USER = getDefaultDavUserId();
const ADMIN_PASSWORD = process.env.NC_ADMIN_PASSWORD?.trim() || 'parity-test-password';
const OTHER_USER = 'alice';
const TEST_CALENDAR = 'parity-personal';
const TEST_EVENT = 'parity-event.ics';
const PUBLIC_TOKEN = 'parity-public-cal-token';
const REMOTE_ID = 'remote-parity-id';
const REMOTE_CLOUD_ID = 'remote-parity-cloud';
const RESOURCE_ID = 'resource-parity-id';
const ROOM_ID = 'room-parity-id';

const SAMPLE_ICS = [
	'BEGIN:VCALENDAR',
	'VERSION:2.0',
	'PRODID:-//Nextcloud//Parity//EN',
	'BEGIN:VEVENT',
	'UID:parity-test-event',
	'DTSTAMP:20260101T120000Z',
	'SUMMARY:Parity test',
	'END:VEVENT',
	'END:VCALENDAR',
].join('\r\n');

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

describe('parity: dav calendars', () => {
	beforeEach(async () => {
		await resetParityCalendarsStores();
	});

	it('unauthenticated PROPFIND on own calendar home returns 401 (dav.Collection#calendars)', async () => {
		const result = await runParityCase({
			name: 'calendars-unauth',
			path: `/remote.php/dav/calendars/${ADMIN_USER}/`,
			options: propfindOptions(`/remote.php/dav/calendars/${ADMIN_USER}/`, '0'),
			compare: DAV_XML_AUTH_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('authenticated PROPFIND depth 0 on own calendar home returns 207 (dav.Collection#calendars)', async () => {
		await seedParityUserCalendar(ADMIN_USER, TEST_CALENDAR, 'Personal');

		const result = await runParityCase({
			name: 'calendars-own-depth-0',
			path: `/remote.php/dav/calendars/${ADMIN_USER}/`,
			options: propfindOptions(`/remote.php/dav/calendars/${ADMIN_USER}/`, '0', basicAuthHeader()),
			compare: DAV_XML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('MKCALENDAR on reserved contact_birthdays returns 405 (dav.Collection#calendars)', async () => {
		const result = await runParityCase({
			name: 'calendars-mkcalendar-reserved',
			path: `/remote.php/dav/calendars/${ADMIN_USER}/contact_birthdays`,
			options: {
				method: 'MKCALENDAR',
				headers: {
					authorization: basicAuthHeader(),
					'content-type': 'application/xml; charset=utf-8',
				},
				body: '<?xml version="1.0"?><mkcalendar xmlns="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav"><set><prop><displayname>Birthdays</displayname></prop></set></mkcalendar>',
			},
			compare: DAV_XML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PUT VEVENT then GET ics returns 201 then 200 (dav.Collection#calendars)', async () => {
		const putResult = await runParityCase({
			name: 'calendars-put-event',
			path: `/remote.php/dav/calendars/${ADMIN_USER}/${TEST_CALENDAR}/${TEST_EVENT}`,
			options: {
				method: 'PUT',
				headers: {
					authorization: basicAuthHeader(),
					'content-type': 'text/calendar; charset=utf-8',
				},
				body: SAMPLE_ICS,
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(putResult.mismatches, formatParityMismatches(putResult.mismatches)).toEqual([]);

		const getResult = await runParityCase({
			name: 'calendars-get-ics',
			path: `/remote.php/dav/calendars/${ADMIN_USER}/${TEST_CALENDAR}/${TEST_EVENT}`,
			options: {
				method: 'GET',
				headers: {
					authorization: basicAuthHeader(),
				},
			},
			compare: {
				contractHeaders: ['content-type', 'etag'],
			},
		});

		expect(getResult.mismatches, formatParityMismatches(getResult.mismatches)).toEqual([]);
	});

	it('other user calendar home does not leak admin events (dav.Collection#calendars)', async () => {
		await seedParityUserCalendar(ADMIN_USER, TEST_CALENDAR, 'Personal');
		await seedParityUserCalendar(OTHER_USER, TEST_CALENDAR, 'Other personal');

		const result = await runParityCase({
			name: 'calendars-other-user-no-leak',
			path: `/remote.php/dav/calendars/${OTHER_USER}/${TEST_CALENDAR}/${TEST_EVENT}`,
			options: {
				method: 'GET',
				headers: {
					authorization: basicAuthHeader(),
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				davXmlBody: true,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('unauthenticated PROPFIND on unknown public calendar token returns 404 (observe) (dav.Collection#public-calendars)', async () => {
		const result = await runParityCase({
			name: 'public-calendars-unknown-token',
			path: '/remote.php/dav/public-calendars/no-such-token/',
			options: propfindOptions('/remote.php/dav/public-calendars/no-such-token/', '0'),
			compare: {
				contractHeaders: ['content-type'],
				davXmlBody: true,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('unauthenticated PROPFIND on seeded public calendar returns 207 (observe) (dav.Collection#public-calendars)', async () => {
		await seedParityPublicCalendar(PUBLIC_TOKEN, ADMIN_USER, TEST_CALENDAR, { displayName: 'Published' });

		const result = await runParityCase({
			name: 'public-calendars-known-token',
			path: `/remote.php/dav/public-calendars/${PUBLIC_TOKEN}/`,
			options: propfindOptions(`/remote.php/dav/public-calendars/${PUBLIC_TOKEN}/`, '0'),
			compare: DAV_XML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('authenticated PROPFIND on unknown remote calendar returns 404 (dav.Collection#remote-calendars)', async () => {
		const result = await runParityCase({
			name: 'remote-calendars-unknown',
			path: `/remote.php/dav/remote-calendars/${REMOTE_CLOUD_ID}/${TEST_CALENDAR}/`,
			options: propfindOptions(`/remote.php/dav/remote-calendars/${REMOTE_CLOUD_ID}/${TEST_CALENDAR}/`, '0', basicAuthHeader()),
			compare: {
				contractHeaders: ['content-type'],
				davXmlBody: true,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('authenticated PROPFIND on seeded remote calendar returns 207 (dav.Collection#remote-calendars)', async () => {
		await seedParityRemoteCalendar(REMOTE_ID, REMOTE_CLOUD_ID, TEST_CALENDAR);

		const result = await runParityCase({
			name: 'remote-calendars-known',
			path: `/remote.php/dav/remote-calendars/${REMOTE_CLOUD_ID}/${TEST_CALENDAR}/`,
			options: propfindOptions(`/remote.php/dav/remote-calendars/${REMOTE_CLOUD_ID}/${TEST_CALENDAR}/`, '0', basicAuthHeader()),
			compare: DAV_XML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('authenticated PROPFIND on unknown system resource calendar returns 404 (dav.Collection#system-calendars-resources)', async () => {
		const result = await runParityCase({
			name: 'system-calendars-resources-unknown',
			path: `/remote.php/dav/system-calendars/calendar-resources/${RESOURCE_ID}/${TEST_CALENDAR}/`,
			options: propfindOptions(`/remote.php/dav/system-calendars/calendar-resources/${RESOURCE_ID}/${TEST_CALENDAR}/`, '0', basicAuthHeader()),
			compare: {
				contractHeaders: ['content-type'],
				davXmlBody: true,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('authenticated PROPFIND on seeded system resource calendar returns 207 (dav.Collection#system-calendars-resources)', async () => {
		await seedParitySystemResourceCalendar(RESOURCE_ID, TEST_CALENDAR);

		const result = await runParityCase({
			name: 'system-calendars-resources-known',
			path: `/remote.php/dav/system-calendars/calendar-resources/${RESOURCE_ID}/${TEST_CALENDAR}/`,
			options: propfindOptions(`/remote.php/dav/system-calendars/calendar-resources/${RESOURCE_ID}/${TEST_CALENDAR}/`, '0', basicAuthHeader()),
			compare: DAV_XML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('authenticated PROPFIND on unknown system room calendar returns 404 (dav.Collection#system-calendars-rooms)', async () => {
		const result = await runParityCase({
			name: 'system-calendars-rooms-unknown',
			path: `/remote.php/dav/system-calendars/calendar-rooms/${ROOM_ID}/${TEST_CALENDAR}/`,
			options: propfindOptions(`/remote.php/dav/system-calendars/calendar-rooms/${ROOM_ID}/${TEST_CALENDAR}/`, '0', basicAuthHeader()),
			compare: {
				contractHeaders: ['content-type'],
				davXmlBody: true,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('authenticated PROPFIND on seeded system room calendar returns 207 (dav.Collection#system-calendars-rooms)', async () => {
		await seedParitySystemRoomCalendar(ROOM_ID, TEST_CALENDAR);

		const result = await runParityCase({
			name: 'system-calendars-rooms-known',
			path: `/remote.php/dav/system-calendars/calendar-rooms/${ROOM_ID}/${TEST_CALENDAR}/`,
			options: propfindOptions(`/remote.php/dav/system-calendars/calendar-rooms/${ROOM_ID}/${TEST_CALENDAR}/`, '0', basicAuthHeader()),
			compare: DAV_XML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});
