import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getParityEnv } from '../env';
import { formatParityMismatches, runParityCase } from '../harness';
import { compareBinarySnapshots, snapshotBinaryResponse } from '../helpers/binary';
import { cookieJarToHeader } from '../helpers/cookies';
import { resetParityExampleContentStores } from '../helpers/dav-example-content';
import {
	loginParitySession,
	loginParitySessionWithCsrf,
} from '../helpers/session';
import { getSessionIdFromOptions, seedNonAdminSession } from '../legacy-mock/two-factor';

const CONFIG_PATH = '/apps/dav/api/defaultcontact/config';
const CONTACT_PATH = '/apps/dav/api/defaultcontact/contact';
const ENABLE_PATH = '/apps/dav/api/exampleEvent/enable';
const EVENT_PATH = '/apps/dav/api/exampleEvent/event';

const JSON_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: ['message'],
};

const SAMPLE_ICS = [
	'BEGIN:VCALENDAR',
	'VERSION:2.0',
	'BEGIN:VEVENT',
	'UID:sample-upload',
	'DTSTART:20250128T100000Z',
	'DTEND:20250128T110000Z',
	'SUMMARY:Upload test',
	'END:VEVENT',
	'END:VCALENDAR',
].join('\r\n');

describe('parity: dav example content', () => {
	beforeEach(async () => {
		await resetParityExampleContentStores();
	});

	afterEach(async () => {
		await resetParityExampleContentStores();
	});

	it('PUT config unauthenticated returns 401 JSON (dav.ExampleContent#setEnableDefaultContact.put)', async () => {
		const result = await runParityCase({
			name: 'dav-example-content-config-unauth-json',
			path: CONFIG_PATH,
			options: {
				method: 'PUT',
				headers: {
					accept: 'application/json',
					'content-type': 'application/json',
				},
				body: JSON.stringify({ allow: true }),
			},
			compare: JSON_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST enable non-admin returns 403 (dav.ExampleContent#setCreateExampleEvent.post)', async () => {
		const jar = await loginParitySession();
		const sessionId = getSessionIdFromOptions({ headers: { cookie: cookieJarToHeader(jar) ?? '' } });

		if (sessionId) {
			seedNonAdminSession(sessionId, 'alice');
		}

		const result = await runParityCase({
			name: 'dav-example-content-enable-non-admin',
			path: ENABLE_PATH,
			options: {
				method: 'POST',
				headers: {
					accept: 'application/json',
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({ enable: true }),
			},
			compare: JSON_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST enable admin returns 200 [] (dav.ExampleContent#setCreateExampleEvent.post)', async () => {
		const { jar, csrfToken } = await loginParitySessionWithCsrf();

		const result = await runParityCase({
			name: 'dav-example-content-enable-happy',
			path: ENABLE_PATH,
			options: {
				method: 'POST',
				headers: {
					accept: 'application/json',
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
					requesttoken: csrfToken,
				},
				body: JSON.stringify({ enable: true }),
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET default contact returns 200 vCard (dav.ExampleContent#getDefaultContact)', async () => {
		const { jar } = await loginParitySessionWithCsrf();
		const env = getParityEnv();
		const options = {
			method: 'GET',
			headers: {
				cookie: cookieJarToHeader(jar) ?? '',
			},
		};

		const [legacyResponse, newResponse] = await Promise.all([
			fetch(`${env.legacyBaseUrl}${CONTACT_PATH}`, options),
			fetch(`${env.newBaseUrl}${CONTACT_PATH}`, options),
		]);

		const [legacySnapshot, newSnapshot] = await Promise.all([
			snapshotBinaryResponse(legacyResponse),
			snapshotBinaryResponse(newResponse),
		]);

		const mismatches = compareBinarySnapshots(
			legacySnapshot,
			newSnapshot,
			['content-type', 'content-disposition'],
			Object.fromEntries(legacyResponse.headers.entries()),
			Object.fromEntries(newResponse.headers.entries()),
		);

		expect(mismatches, formatParityMismatches(mismatches)).toEqual([]);
	});

	it('PUT default contact when disabled returns 403 (dav.ExampleContent#setDefaultContact.put)', async () => {
		const { jar, csrfToken } = await loginParitySessionWithCsrf();

		await runParityCase({
			name: 'dav-example-content-disable-contact',
			path: CONFIG_PATH,
			options: {
				method: 'PUT',
				headers: {
					accept: 'application/json',
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
					requesttoken: csrfToken,
				},
				body: JSON.stringify({ allow: false }),
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		const result = await runParityCase({
			name: 'dav-example-content-set-contact-disabled',
			path: CONTACT_PATH,
			options: {
				method: 'PUT',
				headers: {
					accept: 'application/json',
					'content-type': 'application/json',
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

	it('POST upload while create-example disabled returns 403 (dav.ExampleContent#uploadExampleEvent.post)', async () => {
		const { jar, csrfToken } = await loginParitySessionWithCsrf();

		await runParityCase({
			name: 'dav-example-content-disable-event',
			path: ENABLE_PATH,
			options: {
				method: 'POST',
				headers: {
					accept: 'application/json',
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
					requesttoken: csrfToken,
				},
				body: JSON.stringify({ enable: false }),
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		const result = await runParityCase({
			name: 'dav-example-content-upload-disabled',
			path: EVENT_PATH,
			options: {
				method: 'POST',
				headers: {
					accept: 'application/json',
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
					requesttoken: csrfToken,
				},
				body: JSON.stringify({ ics: SAMPLE_ICS }),
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET example event returns 200 calendar (dav.ExampleContent#downloadExampleEvent)', async () => {
		const { jar } = await loginParitySessionWithCsrf();
		const env = getParityEnv();
		const options = {
			method: 'GET',
			headers: {
				cookie: cookieJarToHeader(jar) ?? '',
			},
		};

		const [legacyResponse, newResponse] = await Promise.all([
			fetch(`${env.legacyBaseUrl}${EVENT_PATH}`, options),
			fetch(`${env.newBaseUrl}${EVENT_PATH}`, options),
		]);

		const [legacySnapshot, newSnapshot] = await Promise.all([
			snapshotBinaryResponse(legacyResponse),
			snapshotBinaryResponse(newResponse),
		]);

		const mismatches = compareBinarySnapshots(
			legacySnapshot,
			newSnapshot,
			['content-type', 'content-disposition'],
			Object.fromEntries(legacyResponse.headers.entries()),
			Object.fromEntries(newResponse.headers.entries()),
		);

		expect(mismatches, formatParityMismatches(mismatches)).toEqual([]);
	});

	it('DELETE custom example event admin returns 200 [] (dav.ExampleContent#deleteExampleEvent.delete)', async () => {
		const { jar, csrfToken } = await loginParitySessionWithCsrf();

		await runParityCase({
			name: 'dav-example-content-upload-before-delete',
			path: EVENT_PATH,
			options: {
				method: 'POST',
				headers: {
					accept: 'application/json',
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
					requesttoken: csrfToken,
				},
				body: JSON.stringify({ ics: SAMPLE_ICS }),
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		const result = await runParityCase({
			name: 'dav-example-content-delete-happy',
			path: EVENT_PATH,
			options: {
				method: 'DELETE',
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

	it('PUT config admin returns 200 [] (dav.ExampleContent#setEnableDefaultContact.put)', async () => {
		const { jar, csrfToken } = await loginParitySessionWithCsrf();

		const result = await runParityCase({
			name: 'dav-example-content-config-happy',
			path: CONFIG_PATH,
			options: {
				method: 'PUT',
				headers: {
					accept: 'application/json',
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
					requesttoken: csrfToken,
				},
				body: JSON.stringify({ allow: true }),
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});
