import { beforeEach, describe, expect, it } from 'vitest';
import { defaultPropfindBody } from '@/src/server/dav/handler';
import { getDefaultDavUserId } from '@/src/server/dav/store';
import { formatParityMismatches, runParityCase } from '../harness';
import {
	resetParityAddressBooksStores,
	seedParitySystemAddressBook,
	seedParityUserAddressBook,
} from '../helpers/dav-addressbooks';

const ADMIN_USER = getDefaultDavUserId();
const ADMIN_PASSWORD = process.env.NC_ADMIN_PASSWORD?.trim() || 'parity-test-password';
const TEST_BOOK = 'parity-contacts';
const TEST_VCARD = 'parity-contact.vcf';

const SAMPLE_VCARD = [
	'BEGIN:VCARD',
	'VERSION:3.0',
	'FN:Parity Test',
	'UID:parity-test-contact',
	'END:VCARD',
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

describe('parity: dav addressbooks', () => {
	beforeEach(async () => {
		await resetParityAddressBooksStores();
	});

	it('unauthenticated PROPFIND on own addressbook home returns 401 (dav.Collection#addressbooks-users)', async () => {
		const result = await runParityCase({
			name: 'addressbooks-users-unauth',
			path: `/remote.php/dav/addressbooks/users/${ADMIN_USER}/`,
			options: propfindOptions(`/remote.php/dav/addressbooks/users/${ADMIN_USER}/`, '0'),
			compare: DAV_XML_AUTH_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('authenticated PROPFIND depth 0 on own addressbook returns 207 (dav.Collection#addressbooks-users)', async () => {
		await seedParityUserAddressBook(ADMIN_USER, TEST_BOOK, 'Contacts');

		const result = await runParityCase({
			name: 'addressbooks-users-own-book',
			path: `/remote.php/dav/addressbooks/users/${ADMIN_USER}/${TEST_BOOK}/`,
			options: propfindOptions(`/remote.php/dav/addressbooks/users/${ADMIN_USER}/${TEST_BOOK}/`, '0', basicAuthHeader()),
			compare: DAV_XML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PUT vcard then GET returns 201 then 200 text/vcard (dav.Collection#addressbooks-users)', async () => {
		const putResult = await runParityCase({
			name: 'addressbooks-users-put-vcard',
			path: `/remote.php/dav/addressbooks/users/${ADMIN_USER}/${TEST_BOOK}/${TEST_VCARD}`,
			options: {
				method: 'PUT',
				headers: {
					authorization: basicAuthHeader(),
					'content-type': 'text/vcard; charset=utf-8',
				},
				body: SAMPLE_VCARD,
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(putResult.mismatches, formatParityMismatches(putResult.mismatches)).toEqual([]);

		const getResult = await runParityCase({
			name: 'addressbooks-users-get-vcard',
			path: `/remote.php/dav/addressbooks/users/${ADMIN_USER}/${TEST_BOOK}/${TEST_VCARD}`,
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

	it('authenticated PROPFIND on system addressbook returns 207 (dav.Collection#addressbooks-system)', async () => {
		await seedParitySystemAddressBook('system', 'system', 'system');

		const result = await runParityCase({
			name: 'addressbooks-system-book',
			path: '/remote.php/dav/addressbooks/system/system/system/',
			options: propfindOptions('/remote.php/dav/addressbooks/system/system/system/', '0', basicAuthHeader()),
			compare: DAV_XML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});
