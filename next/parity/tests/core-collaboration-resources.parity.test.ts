import { afterEach, describe, expect, it } from 'vitest';
import {
	PARITY_ROOM_ACCESSIBLE_ID,
	PARITY_ROOM_ACCESSIBLE_ID_2,
	PARITY_ROOM_INACCESSIBLE_ID,
	PARITY_ROOM_RESOURCE_TYPE,
} from '@/src/server/collaboration-resources/catalog';
import {
	resetCollaborationResourcesStore,
	seedParityCollaborationCollection,
} from '@/src/server/collaboration-resources/store';
import type { CollaborationCollection } from '@/src/server/collaboration-resources/types';
import { formatParityMismatches, runParityCase } from '../harness';
import { cookieJarToHeader } from '../helpers/cookies';
import {
	loginParitySession,
	OCS_JSON_HEADERS,
	OCS_META_PATHS,
} from '../helpers/session';

const COLLECTION_UNSTABLE_PATHS = [
	'ocs.data.id',
	'ocs.data[0].id',
];

async function createParityCollection(cookieHeader: string, name = 'Parity Collection') {
	const response = await fetch('http://127.0.0.1:3100/ocs/v2.php/collaboration/resources/parity-room/room-1?format=json', {
		method: 'POST',
		headers: {
			...OCS_JSON_HEADERS,
			'content-type': 'application/json',
			cookie: cookieHeader,
		},
		body: JSON.stringify({ name }),
	});
	const body = await response.json() as { ocs: { data: CollaborationCollection } };
	const collection = body.ocs.data;

	seedParityCollaborationCollection(collection, 'admin');

	return collection.id;
}

async function syncCollectionSeed(collectionId: number, cookieHeader: string) {
	const response = await fetch(`http://127.0.0.1:3100/ocs/v2.php/collaboration/resources/collections/${collectionId}?format=json`, {
		headers: {
			...OCS_JSON_HEADERS,
			cookie: cookieHeader,
		},
	});
	const body = await response.json() as { ocs: { data: CollaborationCollection } };

	seedParityCollaborationCollection(body.ocs.data, 'admin');
}

describe('parity: core collaboration resources', () => {
	afterEach(() => {
		resetCollaborationResourcesStore();
	});

	it('GET search-collections requires auth (401)', async () => {
		const result = await runParityCase({
			name: 'collab-search-unauth',
			path: '/ocs/v2.php/collaboration/resources/collections/search/parity?format=json',
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

	it('GET list-collection requires auth (401)', async () => {
		const result = await runParityCase({
			name: 'collab-list-unauth',
			path: '/ocs/v2.php/collaboration/resources/collections/1?format=json',
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

	it('GET list-collection returns 404 for unknown collection (validation)', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'collab-list-not-found',
			path: '/ocs/v2.php/collaboration/resources/collections/99999?format=json',
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

	it('POST create-collection-on-resource requires auth (401)', async () => {
		const result = await runParityCase({
			name: 'collab-create-unauth',
			path: `/ocs/v2.php/collaboration/resources/${PARITY_ROOM_RESOURCE_TYPE}/${PARITY_ROOM_ACCESSIBLE_ID}?format=json`,
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
				},
				body: JSON.stringify({ name: 'Parity Collection' }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST create-collection-on-resource rejects empty name (400)', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'collab-create-empty-name',
			path: `/ocs/v2.php/collaboration/resources/${PARITY_ROOM_RESOURCE_TYPE}/${PARITY_ROOM_ACCESSIBLE_ID}?format=json`,
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({ name: '' }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST create-collection-on-resource happy path', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'collab-create-happy',
			path: `/ocs/v2.php/collaboration/resources/${PARITY_ROOM_RESOURCE_TYPE}/${PARITY_ROOM_ACCESSIBLE_ID}?format=json`,
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({ name: 'Parity Collection' }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.name',
					'ocs.data.resources[0].type',
					'ocs.data.resources[0].id',
				],
				unstableIdPaths: COLLECTION_UNSTABLE_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET search-collections happy path', async () => {
		const jar = await loginParitySession();
		const cookie = cookieJarToHeader(jar) ?? '';
		await createParityCollection(cookie, 'Parity Search Target');

		const result = await runParityCase({
			name: 'collab-search-happy',
			path: '/ocs/v2.php/collaboration/resources/collections/search/search?format=json',
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie,
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data[0].name',
				],
				unstableIdPaths: COLLECTION_UNSTABLE_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET list-collection happy path', async () => {
		const jar = await loginParitySession();
		const cookie = cookieJarToHeader(jar) ?? '';
		const collectionId = await createParityCollection(cookie);

		const result = await runParityCase({
			name: 'collab-list-happy',
			path: `/ocs/v2.php/collaboration/resources/collections/${collectionId}?format=json`,
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie,
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.name',
					'ocs.data.resources[0].id',
				],
				unstableIdPaths: COLLECTION_UNSTABLE_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST add-resource requires auth (401)', async () => {
		const result = await runParityCase({
			name: 'collab-add-unauth',
			path: '/ocs/v2.php/collaboration/resources/collections/1?format=json',
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
				},
				body: JSON.stringify({
					resourceType: PARITY_ROOM_RESOURCE_TYPE,
					resourceId: PARITY_ROOM_ACCESSIBLE_ID_2,
				}),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST add-resource returns 404 for inaccessible resource (validation)', async () => {
		const jar = await loginParitySession();
		const cookie = cookieJarToHeader(jar) ?? '';
		const collectionId = await createParityCollection(cookie);

		const result = await runParityCase({
			name: 'collab-add-inaccessible',
			path: `/ocs/v2.php/collaboration/resources/collections/${collectionId}?format=json`,
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie,
				},
				body: JSON.stringify({
					resourceType: PARITY_ROOM_RESOURCE_TYPE,
					resourceId: PARITY_ROOM_INACCESSIBLE_ID,
				}),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST add-resource happy path', async () => {
		const jar = await loginParitySession();
		const cookie = cookieJarToHeader(jar) ?? '';
		const collectionId = await createParityCollection(cookie);

		const result = await runParityCase({
			name: 'collab-add-happy',
			path: `/ocs/v2.php/collaboration/resources/collections/${collectionId}?format=json`,
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie,
				},
				body: JSON.stringify({
					resourceType: PARITY_ROOM_RESOURCE_TYPE,
					resourceId: PARITY_ROOM_ACCESSIBLE_ID_2,
				}),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.resources.length',
				],
				unstableIdPaths: COLLECTION_UNSTABLE_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('DELETE remove-resource requires auth (401)', async () => {
		const result = await runParityCase({
			name: 'collab-remove-unauth',
			path: `/ocs/v2.php/collaboration/resources/collections/1?resourceType=${PARITY_ROOM_RESOURCE_TYPE}&resourceId=${PARITY_ROOM_ACCESSIBLE_ID_2}&format=json`,
			options: {
				method: 'DELETE',
				headers: OCS_JSON_HEADERS,
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('DELETE remove-resource returns 404 for unknown collection (validation)', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'collab-remove-not-found',
			path: `/ocs/v2.php/collaboration/resources/collections/99999?resourceType=${PARITY_ROOM_RESOURCE_TYPE}&resourceId=${PARITY_ROOM_ACCESSIBLE_ID_2}&format=json`,
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

	it('DELETE remove-resource happy path', async () => {
		const jar = await loginParitySession();
		const cookie = cookieJarToHeader(jar) ?? '';
		const collectionId = await createParityCollection(cookie);

		await fetch(`http://127.0.0.1:3100/ocs/v2.php/collaboration/resources/collections/${collectionId}?format=json`, {
			method: 'POST',
			headers: {
				...OCS_JSON_HEADERS,
				'content-type': 'application/json',
				cookie,
			},
			body: JSON.stringify({
				resourceType: PARITY_ROOM_RESOURCE_TYPE,
				resourceId: PARITY_ROOM_ACCESSIBLE_ID_2,
			}),
		});
		await syncCollectionSeed(collectionId, cookie);

		const result = await runParityCase({
			name: 'collab-remove-happy',
			path: `/ocs/v2.php/collaboration/resources/collections/${collectionId}?resourceType=${PARITY_ROOM_RESOURCE_TYPE}&resourceId=${PARITY_ROOM_ACCESSIBLE_ID_2}&format=json`,
			options: {
				method: 'DELETE',
				headers: {
					...OCS_JSON_HEADERS,
					cookie,
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.resources.length',
				],
				unstableIdPaths: COLLECTION_UNSTABLE_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PUT rename-collection requires auth (401)', async () => {
		const result = await runParityCase({
			name: 'collab-rename-unauth',
			path: '/ocs/v2.php/collaboration/resources/collections/1?format=json',
			options: {
				method: 'PUT',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
				},
				body: JSON.stringify({ collectionName: 'Renamed' }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PUT rename-collection returns 404 for unknown collection (validation)', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'collab-rename-not-found',
			path: '/ocs/v2.php/collaboration/resources/collections/99999?format=json',
			options: {
				method: 'PUT',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({ collectionName: 'Renamed' }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('PUT rename-collection happy path', async () => {
		const jar = await loginParitySession();
		const cookie = cookieJarToHeader(jar) ?? '';
		const collectionId = await createParityCollection(cookie);

		const result = await runParityCase({
			name: 'collab-rename-happy',
			path: `/ocs/v2.php/collaboration/resources/collections/${collectionId}?format=json`,
			options: {
				method: 'PUT',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie,
				},
				body: JSON.stringify({ collectionName: 'Renamed Collection' }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.name',
				],
				unstableIdPaths: COLLECTION_UNSTABLE_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET get-collections-by-resource requires auth (401)', async () => {
		const result = await runParityCase({
			name: 'collab-by-resource-unauth',
			path: `/ocs/v2.php/collaboration/resources/${PARITY_ROOM_RESOURCE_TYPE}/${PARITY_ROOM_ACCESSIBLE_ID}?format=json`,
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

	it('GET get-collections-by-resource returns 404 for inaccessible resource (validation)', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'collab-by-resource-inaccessible',
			path: `/ocs/v2.php/collaboration/resources/${PARITY_ROOM_RESOURCE_TYPE}/${PARITY_ROOM_INACCESSIBLE_ID}?format=json`,
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

	it('GET get-collections-by-resource happy path', async () => {
		const jar = await loginParitySession();
		const cookie = cookieJarToHeader(jar) ?? '';
		await createParityCollection(cookie, 'Lookup Collection');

		const result = await runParityCase({
			name: 'collab-by-resource-happy',
			path: `/ocs/v2.php/collaboration/resources/${PARITY_ROOM_RESOURCE_TYPE}/${PARITY_ROOM_ACCESSIBLE_ID}?format=json`,
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie,
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data[0].name',
				],
				unstableIdPaths: COLLECTION_UNSTABLE_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});
