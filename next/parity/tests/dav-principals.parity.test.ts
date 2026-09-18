import { beforeEach, describe, expect, it } from 'vitest';
import { defaultPropfindBody } from '@/src/server/dav/handler';
import { getDefaultDavUserId } from '@/src/server/dav/store';
import { formatParityMismatches, runParityCase } from '../harness';
import { resetParityPrincipalsStores } from '../helpers/dav-principals';

const ADMIN_USER = getDefaultDavUserId();
const ADMIN_PASSWORD = process.env.NC_ADMIN_PASSWORD?.trim() || 'parity-test-password';

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

describe('parity: dav principals', () => {
	beforeEach(async () => {
		await resetParityPrincipalsStores();
	});

	it('unauthenticated PROPFIND on own user principal returns 401 (dav.Collection#principals-users)', async () => {
		const result = await runParityCase({
			name: 'principals-users-unauth',
			path: `/remote.php/dav/principals/users/${ADMIN_USER}/`,
			options: propfindOptions(`/remote.php/dav/principals/users/${ADMIN_USER}/`, '0'),
			compare: DAV_XML_AUTH_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('authenticated PROPFIND depth 0 on own user principal returns 207 (dav.Collection#principals-users)', async () => {
		const result = await runParityCase({
			name: 'principals-users-own-depth-0',
			path: `/remote.php/dav/principals/users/${ADMIN_USER}/`,
			options: propfindOptions(`/remote.php/dav/principals/users/${ADMIN_USER}/`, '0', basicAuthHeader()),
			compare: DAV_XML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('authenticated PROPFIND on unknown user principal returns 404 (dav.Collection#principals-users)', async () => {
		const result = await runParityCase({
			name: 'principals-users-unknown',
			path: '/remote.php/dav/principals/users/no-such-parity-user/',
			options: propfindOptions('/remote.php/dav/principals/users/no-such-parity-user/', '0', basicAuthHeader()),
			compare: {
				contractHeaders: ['content-type'],
				davXmlBody: true,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('unauthenticated PROPFIND on principals/system/public is not 401 (dav.Collection#principals-system)', async () => {
		const result = await runParityCase({
			name: 'principals-system-public-unauth',
			path: '/remote.php/dav/principals/system/public/',
			options: propfindOptions('/remote.php/dav/principals/system/public/', '0'),
			compare: DAV_XML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('authenticated PROPFIND depth 0 on group principal returns 207 (dav.Collection#principals-groups)', async () => {
		const result = await runParityCase({
			name: 'principals-groups-admin',
			path: '/remote.php/dav/principals/groups/admin/',
			options: propfindOptions('/remote.php/dav/principals/groups/admin/', '0', basicAuthHeader()),
			compare: DAV_XML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('authenticated PROPFIND on unknown calendar resource principal returns 404 (dav.Collection#principals-calendar-resources)', async () => {
		const result = await runParityCase({
			name: 'principals-calendar-resources-unknown',
			path: '/remote.php/dav/principals/calendar-resources/missing-resource/',
			options: propfindOptions('/remote.php/dav/principals/calendar-resources/missing-resource/', '0', basicAuthHeader()),
			compare: {
				contractHeaders: ['content-type'],
				davXmlBody: true,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('authenticated PROPFIND on unknown calendar room principal returns 404 (dav.Collection#principals-calendar-rooms)', async () => {
		const result = await runParityCase({
			name: 'principals-calendar-rooms-unknown',
			path: '/remote.php/dav/principals/calendar-rooms/missing-room/',
			options: propfindOptions('/remote.php/dav/principals/calendar-rooms/missing-room/', '0', basicAuthHeader()),
			compare: {
				contractHeaders: ['content-type'],
				davXmlBody: true,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('authenticated PROPFIND on unknown remote user principal returns 404 (dav.Collection#principals-remote-users)', async () => {
		const result = await runParityCase({
			name: 'principals-remote-users-unknown',
			path: '/remote.php/dav/principals/remote-users/bm9zdWNo/',
			options: propfindOptions('/remote.php/dav/principals/remote-users/bm9zdWNo/', '0', basicAuthHeader()),
			compare: {
				contractHeaders: ['content-type'],
				davXmlBody: true,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PROPFIND depth 1 on principals/users collection does not list children without debug (observe)', async () => {
		const result = await runParityCase({
			name: 'principals-users-collection-depth-1-no-listing',
			path: '/remote.php/dav/principals/users/',
			options: propfindOptions('/remote.php/dav/principals/users/', '1', basicAuthHeader()),
			compare: DAV_XML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});
