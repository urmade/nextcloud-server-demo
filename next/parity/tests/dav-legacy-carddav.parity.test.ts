import { beforeEach, describe, expect, it } from 'vitest';
import { defaultPropfindBody } from '@/src/server/dav/handler';
import { getDefaultDavUserId } from '@/src/server/dav/store';
import { storeAppPasswordToken } from '@/src/server/ocs/app-password-store';
import { formatParityMismatches, runParityCase } from '../harness';
import { resetParityAddressBooksStores, seedParityUserAddressBook } from '../helpers/dav-addressbooks';

const ADMIN_USER = getDefaultDavUserId();
const ADMIN_PASSWORD = process.env.NC_ADMIN_PASSWORD?.trim() || 'parity-test-password';
const TEST_BOOK = 'legacy-carddav-contacts';
const BEARER_APP_PASSWORD = 'legacyCardDavBearerOnlyToken012345678901234567890123456789012345678901234';

function legacyAddressBookHomePath(service: 'carddav' | 'contacts', userId = ADMIN_USER): string {
	return `/remote.php/${service}/principals/users/${userId}/addressbooks/`;
}

function legacyAddressBookPath(service: 'carddav' | 'contacts', userId = ADMIN_USER, bookUri = TEST_BOOK): string {
	return `/remote.php/${service}/principals/users/${userId}/addressbooks/${bookUri}/`;
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

describe('parity: dav legacy carddav', () => {
	beforeEach(async () => {
		await resetParityAddressBooksStores();
		storeAppPasswordToken(ADMIN_USER, ADMIN_USER, BEARER_APP_PASSWORD, 'parity-test');
	});

	it('unauthenticated PROPFIND on addressbook home returns 401 with Basic challenge (dav.LegacyCardDAV#carddav)', async () => {
		const result = await runParityCase({
			name: 'legacy-carddav-unauth',
			path: legacyAddressBookHomePath('carddav'),
			options: propfindOptions(legacyAddressBookHomePath('carddav'), '0'),
			compare: DAV_XML_AUTH_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('Bearer-only PROPFIND returns 401 (dav.LegacyCardDAV#carddav)', async () => {
		const result = await runParityCase({
			name: 'legacy-carddav-bearer-only',
			path: legacyAddressBookHomePath('carddav'),
			options: propfindOptions(legacyAddressBookHomePath('carddav'), '0', bearerAuthHeader(BEARER_APP_PASSWORD)),
			compare: DAV_XML_AUTH_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('authenticated PROPFIND depth 0 on own addressbook returns 207 (dav.LegacyCardDAV#carddav)', async () => {
		await seedParityUserAddressBook(ADMIN_USER, TEST_BOOK, 'Legacy contacts');

		const result = await runParityCase({
			name: 'legacy-carddav-own-depth-0',
			path: legacyAddressBookPath('carddav'),
			options: propfindOptions(legacyAddressBookPath('carddav'), '0', basicAuthHeader()),
			compare: DAV_XML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('contacts alias serves the same addressbook resource as carddav (dav.LegacyCardDAV#contacts)', async () => {
		await seedParityUserAddressBook(ADMIN_USER, TEST_BOOK, 'Legacy contacts');

		const carddavResult = await runParityCase({
			name: 'legacy-carddav-book-resource',
			path: legacyAddressBookPath('carddav'),
			options: propfindOptions(legacyAddressBookPath('carddav'), '0', basicAuthHeader()),
			compare: DAV_XML_COMPARE,
		});

		expect(carddavResult.mismatches, formatParityMismatches(carddavResult.mismatches)).toEqual([]);

		const aliasResult = await runParityCase({
			name: 'legacy-contacts-alias-resource',
			path: legacyAddressBookPath('contacts'),
			options: propfindOptions(legacyAddressBookPath('contacts'), '0', basicAuthHeader()),
			compare: DAV_XML_COMPARE,
		});

		expect(aliasResult.mismatches, formatParityMismatches(aliasResult.mismatches)).toEqual([]);
	});
});
