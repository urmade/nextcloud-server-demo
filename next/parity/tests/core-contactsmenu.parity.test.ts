import { describe, expect, it } from 'vitest';
import { formatParityMismatches, runParityCase } from '../harness';
import { cookieJarToHeader } from '../helpers/cookies';
import { loginParitySessionWithCsrf } from '../helpers/session';

describe('parity: core contactsmenu', () => {
	it('POST /index.php/contactsmenu/contacts without CSRF returns 412 (core.ContactsMenu#index.post)', async () => {
		const { jar } = await loginParitySessionWithCsrf();

		const result = await runParityCase({
			name: 'contactsmenu-contacts-no-csrf',
			path: '/index.php/contactsmenu/contacts',
			options: {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({ filter: 'ali' }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: ['message'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /index.php/contactsmenu/contacts unauthenticated returns 401 (core.ContactsMenu#index.post)', async () => {
		const result = await runParityCase({
			name: 'contactsmenu-contacts-unauth',
			path: '/index.php/contactsmenu/contacts',
			options: {
				method: 'POST',
				headers: {
					accept: 'application/json',
					'content-type': 'application/json',
				},
				body: JSON.stringify({ filter: 'ali' }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: ['message'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /index.php/contactsmenu/contacts returns contacts payload (core.ContactsMenu#index.post)', async () => {
		const { jar, csrfToken } = await loginParitySessionWithCsrf();

		const result = await runParityCase({
			name: 'contactsmenu-contacts-happy',
			path: '/index.php/contactsmenu/contacts',
			options: {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
					requesttoken: csrfToken,
				},
				body: JSON.stringify({ filter: 'ali' }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: ['contacts', 'contactsAppEnabled'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /index.php/contactsmenu/findOne without CSRF returns 412 (core.ContactsMenu#findOne.post)', async () => {
		const { jar } = await loginParitySessionWithCsrf();

		const result = await runParityCase({
			name: 'contactsmenu-findone-no-csrf',
			path: '/index.php/contactsmenu/findOne',
			options: {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({ shareType: 0, shareWith: 'alice' }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: ['message'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /index.php/contactsmenu/findOne unknown returns 404 [] (core.ContactsMenu#findOne.post)', async () => {
		const { jar, csrfToken } = await loginParitySessionWithCsrf();

		const result = await runParityCase({
			name: 'contactsmenu-findone-unknown',
			path: '/index.php/contactsmenu/findOne',
			options: {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
					requesttoken: csrfToken,
				},
				body: JSON.stringify({ shareType: 0, shareWith: 'nobody' }),
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /index.php/contactsmenu/findOne missing params returns 400 (core.ContactsMenu#findOne.post)', async () => {
		const { jar, csrfToken } = await loginParitySessionWithCsrf();

		const result = await runParityCase({
			name: 'contactsmenu-findone-missing-params',
			path: '/index.php/contactsmenu/findOne',
			options: {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
					requesttoken: csrfToken,
				},
				body: JSON.stringify({}),
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /index.php/contactsmenu/teams returns array (core.ContactsMenu#getTeams)', async () => {
		const { jar } = await loginParitySessionWithCsrf();

		const result = await runParityCase({
			name: 'contactsmenu-teams-happy',
			path: '/index.php/contactsmenu/teams',
			options: {
				headers: {
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /index.php/displaynames without CSRF returns 412 (core.User#getDisplayNames.post)', async () => {
		const { jar } = await loginParitySessionWithCsrf();

		const result = await runParityCase({
			name: 'displaynames-no-csrf',
			path: '/index.php/displaynames',
			options: {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({ users: ['admin', 'missing'] }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: ['message'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /index.php/displaynames returns users map (core.User#getDisplayNames.post)', async () => {
		const { jar, csrfToken } = await loginParitySessionWithCsrf();

		const result = await runParityCase({
			name: 'displaynames-happy',
			path: '/index.php/displaynames',
			options: {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
					requesttoken: csrfToken,
				},
				body: JSON.stringify({ users: ['admin', 'missing'] }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: ['users.admin', 'users.missing', 'status'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});
