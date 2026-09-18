import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatParityMismatches, runParityCase } from '../harness';
import { resetParityBirthdayStores } from '../helpers/dav-birthday';
import { cookieJarToHeader } from '../helpers/cookies';
import {
	loginParitySession,
	loginParitySessionWithCsrf,
} from '../helpers/session';
import { getSessionIdFromOptions, seedNonAdminSession } from '../legacy-mock/two-factor';

const ENABLE_PATH = '/apps/dav/enableBirthdayCalendar';
const DISABLE_PATH = '/apps/dav/disableBirthdayCalendar';

const JSON_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: ['message'],
};

describe('parity: dav birthday calendar', () => {
	beforeEach(async () => {
		await resetParityBirthdayStores();
	});

	afterEach(async () => {
		await resetParityBirthdayStores();
	});

	it('POST enable unauthenticated returns 401 JSON (dav.birthday_calendar#enable.post)', async () => {
		const result = await runParityCase({
			name: 'dav-birthday-enable-unauth-json',
			path: ENABLE_PATH,
			options: {
				method: 'POST',
				headers: {
					accept: 'application/json',
				},
			},
			compare: JSON_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST enable unauthenticated returns 303 login HTML (dav.birthday_calendar#enable.post)', async () => {
		const result = await runParityCase({
			name: 'dav-birthday-enable-unauth-html',
			path: ENABLE_PATH,
			options: {
				method: 'POST',
				headers: {
					accept: 'text/html',
				},
			},
			compare: {
				contractHeaders: ['location'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST enable non-admin returns 403 (dav.birthday_calendar#enable.post)', async () => {
		const jar = await loginParitySession();
		const sessionId = getSessionIdFromOptions({ headers: { cookie: cookieJarToHeader(jar) ?? '' } });

		if (sessionId) {
			seedNonAdminSession(sessionId, 'alice');
		}

		const result = await runParityCase({
			name: 'dav-birthday-enable-non-admin',
			path: ENABLE_PATH,
			options: {
				method: 'POST',
				headers: {
					accept: 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: JSON_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST enable without CSRF returns 412 (dav.birthday_calendar#enable.post)', async () => {
		const { jar } = await loginParitySessionWithCsrf();

		const result = await runParityCase({
			name: 'dav-birthday-enable-no-csrf',
			path: ENABLE_PATH,
			options: {
				method: 'POST',
				headers: {
					accept: 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: JSON_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST enable admin returns 200 [] (dav.birthday_calendar#enable.post)', async () => {
		const { jar, csrfToken } = await loginParitySessionWithCsrf();

		const result = await runParityCase({
			name: 'dav-birthday-enable-happy',
			path: ENABLE_PATH,
			options: {
				method: 'POST',
				headers: {
					accept: 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
					requesttoken: csrfToken,
				},
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST disable admin returns 200 [] (dav.birthday_calendar#disable.post)', async () => {
		const { jar, csrfToken } = await loginParitySessionWithCsrf();

		const result = await runParityCase({
			name: 'dav-birthday-disable-happy',
			path: DISABLE_PATH,
			options: {
				method: 'POST',
				headers: {
					accept: 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
					requesttoken: csrfToken,
				},
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});
