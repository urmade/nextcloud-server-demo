import { beforeEach, describe, expect, it } from 'vitest';
import { defaultPropfindBody } from '@/src/server/dav/handler';
import { getDefaultDavUserId } from '@/src/server/dav/store';
import { storeAppPasswordToken } from '@/src/server/ocs/app-password-store';
import { formatParityMismatches, runParityCase } from '../harness';
import { resetParityCalendarsStores, seedParityUserCalendar } from '../helpers/dav-calendars';

const ADMIN_USER = getDefaultDavUserId();
const ADMIN_PASSWORD = process.env.NC_ADMIN_PASSWORD?.trim() || 'parity-test-password';
const TEST_CALENDAR = 'legacy-caldav-personal';
const BEARER_APP_PASSWORD = 'legacyCaldavBearerOnlyToken012345678901234567890123456789012345678901234';

function legacyCalendarHomePath(service: 'caldav' | 'calendar', userId = ADMIN_USER): string {
	return `/remote.php/${service}/principals/users/${userId}/calendars/`;
}

function legacyCalendarPath(service: 'caldav' | 'calendar', userId = ADMIN_USER, calendarUri = TEST_CALENDAR): string {
	return `/remote.php/${service}/principals/users/${userId}/calendars/${calendarUri}/`;
}

function basicAuthHeader(username = ADMIN_USER, password = ADMIN_PASSWORD): string {
	return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

function bearerAuthHeader(token: string): string {
	return `Bearer ${token}`;
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

describe('parity: dav legacy caldav', () => {
	beforeEach(async () => {
		await resetParityCalendarsStores();
		storeAppPasswordToken(ADMIN_USER, ADMIN_USER, BEARER_APP_PASSWORD, 'parity-test');
	});

	it('unauthenticated PROPFIND on calendar home returns 401 with Basic challenge (dav.LegacyCalDAV#caldav)', async () => {
		const result = await runParityCase({
			name: 'legacy-caldav-unauth',
			path: legacyCalendarHomePath('caldav'),
			options: propfindOptions(legacyCalendarHomePath('caldav'), '0'),
			compare: DAV_XML_AUTH_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('Bearer-only PROPFIND returns 401 (dav.LegacyCalDAV#caldav)', async () => {
		const result = await runParityCase({
			name: 'legacy-caldav-bearer-only',
			path: legacyCalendarHomePath('caldav'),
			options: propfindOptions(legacyCalendarHomePath('caldav'), '0', bearerAuthHeader(BEARER_APP_PASSWORD)),
			compare: DAV_XML_AUTH_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('authenticated PROPFIND depth 0 on own calendar home returns 207 (dav.LegacyCalDAV#caldav)', async () => {
		await seedParityUserCalendar(ADMIN_USER, TEST_CALENDAR, 'Legacy personal');

		const result = await runParityCase({
			name: 'legacy-caldav-own-depth-0',
			path: legacyCalendarHomePath('caldav'),
			options: propfindOptions(legacyCalendarHomePath('caldav'), '0', basicAuthHeader()),
			compare: DAV_XML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('calendar alias serves the same calendar resource as caldav (dav.LegacyCalDAV#calendar)', async () => {
		await seedParityUserCalendar(ADMIN_USER, TEST_CALENDAR, 'Legacy personal');

		const caldavResult = await runParityCase({
			name: 'legacy-caldav-calendar-resource',
			path: legacyCalendarPath('caldav'),
			options: propfindOptions(legacyCalendarPath('caldav'), '0', basicAuthHeader()),
			compare: DAV_XML_COMPARE,
		});

		expect(caldavResult.mismatches, formatParityMismatches(caldavResult.mismatches)).toEqual([]);

		const aliasResult = await runParityCase({
			name: 'legacy-calendar-alias-resource',
			path: legacyCalendarPath('calendar'),
			options: propfindOptions(legacyCalendarPath('calendar'), '0', basicAuthHeader()),
			compare: DAV_XML_COMPARE,
		});

		expect(aliasResult.mismatches, formatParityMismatches(aliasResult.mismatches)).toEqual([]);
	});
});
