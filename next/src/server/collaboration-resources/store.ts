import {
	buildResourceLink,
	findParityCollaborationResource,
	isCollaborationProviderEnabled,
} from '@/src/server/collaboration-resources/catalog';
import type {
	CollaborationCollection,
	CollaborationResourceRef,
	CollaborationRichObject,
} from '@/src/server/collaboration-resources/types';

interface CollectionRecord {
	id: number;
	name: string;
	resources: CollaborationResourceRef[];
}

const globalForCollaboration = globalThis as typeof globalThis & {
	__ncCollaborationCollections?: Map<number, CollectionRecord>;
	__ncCollaborationKnownResources?: Set<string>;
	__ncCollaborationCollectionAccess?: Map<string, Map<number, boolean>>;
	__ncCollaborationNextId?: number;
};

function resourceKey(type: string, id: string): string {
	return `${type}:${id}`;
}

function getCollections(): Map<number, CollectionRecord> {
	if (!globalForCollaboration.__ncCollaborationCollections) {
		globalForCollaboration.__ncCollaborationCollections = new Map();
	}

	return globalForCollaboration.__ncCollaborationCollections;
}

function getKnownResources(): Set<string> {
	if (!globalForCollaboration.__ncCollaborationKnownResources) {
		globalForCollaboration.__ncCollaborationKnownResources = new Set();
	}

	return globalForCollaboration.__ncCollaborationKnownResources;
}

function getCollectionAccessCache(): Map<string, Map<number, boolean>> {
	if (!globalForCollaboration.__ncCollaborationCollectionAccess) {
		globalForCollaboration.__ncCollaborationCollectionAccess = new Map();
	}

	return globalForCollaboration.__ncCollaborationCollectionAccess;
}

function getNextCollectionId(): number {
	if (!globalForCollaboration.__ncCollaborationNextId) {
		globalForCollaboration.__ncCollaborationNextId = 1;
	}

	const id = globalForCollaboration.__ncCollaborationNextId;
	globalForCollaboration.__ncCollaborationNextId += 1;

	return id;
}

export class CollectionNotFoundError extends Error {
	constructor() {
		super('Collection not found');
		this.name = 'CollectionNotFoundError';
	}
}

export class ResourceNotFoundError extends Error {
	constructor() {
		super('Resource not found');
		this.name = 'ResourceNotFoundError';
	}
}

export class ResourceAlreadyInCollectionError extends Error {
	constructor() {
		super('Already part of the collection');
		this.name = 'ResourceAlreadyInCollectionError';
	}
}

function canUserAccessResource(userId: string, type: string, id: string): boolean {
	const fixture = findParityCollaborationResource(type, id);

	if (!fixture) {
		return false;
	}

	return fixture.accessibleUserIds.includes(userId);
}

function getCachedCollectionAccess(userId: string, collectionId: number): boolean | null {
	const cached = getCollectionAccessCache().get(userId)?.get(collectionId);

	return cached ?? null;
}

function cacheCollectionAccess(userId: string, collectionId: number, access: boolean): void {
	const cache = getCollectionAccessCache();
	const userCache = cache.get(userId) ?? new Map<number, boolean>();
	userCache.set(collectionId, access);
	cache.set(userId, userCache);
}

function invalidateCollectionAccess(collectionId: number): void {
	for (const userCache of getCollectionAccessCache().values()) {
		userCache.delete(collectionId);
	}
}

function canUserAccessCollection(userId: string, collection: CollectionRecord): boolean {
	const cached = getCachedCollectionAccess(userId, collection.id);

	if (cached !== null) {
		return cached;
	}

	if (collection.resources.length === 0) {
		cacheCollectionAccess(userId, collection.id, false);

		return false;
	}

	for (const resource of collection.resources) {
		if (!canUserAccessResource(userId, resource.type, resource.id)) {
			cacheCollectionAccess(userId, collection.id, false);

			return false;
		}
	}

	cacheCollectionAccess(userId, collection.id, true);

	return true;
}

function buildRichObject(origin: string, type: string, id: string): CollaborationRichObject | null {
	const fixture = findParityCollaborationResource(type, id);

	if (!fixture) {
		return null;
	}

	return {
		type: fixture.type,
		id: fixture.id,
		name: fixture.name,
		link: buildResourceLink(origin, fixture.type, fixture.id),
	};
}

function prepareCollection(origin: string, userId: string, collection: CollectionRecord): CollaborationCollection {
	if (!canUserAccessCollection(userId, collection)) {
		throw new CollectionNotFoundError();
	}

	const resources: CollaborationRichObject[] = [];

	for (const resource of collection.resources) {
		if (!canUserAccessResource(userId, resource.type, resource.id)) {
			continue;
		}

		const richObject = buildRichObject(origin, resource.type, resource.id);

		if (richObject) {
			resources.push(richObject);
		}
	}

	return {
		id: collection.id,
		name: collection.name,
		resources,
	};
}

function getCollectionRecord(collectionId: number): CollectionRecord {
	const collection = getCollections().get(collectionId);

	if (!collection) {
		throw new CollectionNotFoundError();
	}

	return collection;
}

function registerKnownResource(type: string, id: string): void {
	getKnownResources().add(resourceKey(type, id));
}

function isSameResource(a: CollaborationResourceRef, b: CollaborationResourceRef): boolean {
	return a.type === b.type && a.id === b.id;
}

export function resetCollaborationResourcesStore(): void {
	getCollections().clear();
	getKnownResources().clear();
	getCollectionAccessCache().clear();
	globalForCollaboration.__ncCollaborationNextId = 1;
}

export function seedParityCollaborationCollection(
	collection: CollaborationCollection,
	userId = 'admin',
): void {
	const record: CollectionRecord = {
		id: collection.id,
		name: collection.name,
		resources: collection.resources.map((resource) => ({
			type: resource.type,
			id: resource.id,
		})),
	};

	for (const resource of record.resources) {
		registerKnownResource(resource.type, resource.id);
	}

	getCollections().set(collection.id, record);
	cacheCollectionAccess(userId, collection.id, true);

	if (collection.id >= (globalForCollaboration.__ncCollaborationNextId ?? 1)) {
		globalForCollaboration.__ncCollaborationNextId = collection.id + 1;
	}
}

export function getCollectionForUser(
	origin: string,
	userId: string,
	collectionId: number,
): CollaborationCollection {
	const collection = getCollectionRecord(collectionId);

	return prepareCollection(origin, userId, collection);
}

export function searchCollections(
	origin: string,
	userId: string,
	filter: string,
): CollaborationCollection[] {
	const normalizedFilter = filter.toLowerCase();
	const results: CollaborationCollection[] = [];

	for (const collection of getCollections().values()) {
		if (!canUserAccessCollection(userId, collection)) {
			continue;
		}

		if (normalizedFilter !== '' && !collection.name.toLowerCase().includes(normalizedFilter)) {
			continue;
		}

		try {
			results.push(prepareCollection(origin, userId, collection));
		} catch {
			// Skip inaccessible collections while preparing.
		}
	}

	return results.sort((left, right) => left.id - right.id);
}

export function addResourceToCollection(
	origin: string,
	userId: string,
	collectionId: number,
	resourceType: string,
	resourceId: string,
): CollaborationCollection {
	const collection = getCollectionRecord(collectionId);

	if (!canUserAccessCollection(userId, collection)) {
		throw new CollectionNotFoundError();
	}

	if (!canUserAccessResource(userId, resourceType, resourceId)) {
		throw new CollectionNotFoundError();
	}

	const resourceRef = { type: resourceType, id: resourceId };
	const alreadyPresent = collection.resources.some((resource) => isSameResource(resource, resourceRef));

	if (!alreadyPresent) {
		collection.resources.push(resourceRef);
		registerKnownResource(resourceType, resourceId);
		invalidateCollectionAccess(collection.id);
	}

	return prepareCollection(origin, userId, collection);
}

export function removeResourceFromCollection(
	origin: string,
	userId: string,
	collectionId: number,
	resourceType: string,
	resourceId: string,
): CollaborationCollection {
	const collection = getCollectionRecord(collectionId);

	if (!canUserAccessCollection(userId, collection)) {
		throw new CollectionNotFoundError();
	}

	if (!getKnownResources().has(resourceKey(resourceType, resourceId))) {
		throw new ResourceNotFoundError();
	}

	collection.resources = collection.resources.filter((resource) => !isSameResource(resource, { type: resourceType, id: resourceId }));

	if (collection.resources.length === 0) {
		getCollections().delete(collection.id);
		invalidateCollectionAccess(collection.id);

		throw new CollectionNotFoundError();
	}

	invalidateCollectionAccess(collection.id);

	return prepareCollection(origin, userId, collection);
}

export function getCollectionsByResource(
	origin: string,
	userId: string,
	resourceType: string,
	resourceId: string,
): CollaborationCollection[] {
	if (!canUserAccessResource(userId, resourceType, resourceId)) {
		throw new CollectionNotFoundError();
	}

	const results: CollaborationCollection[] = [];

	for (const collection of getCollections().values()) {
		const containsResource = collection.resources.some((resource) => isSameResource(resource, {
			type: resourceType,
			id: resourceId,
		}));

		if (!containsResource) {
			continue;
		}

		try {
			results.push(prepareCollection(origin, userId, collection));
		} catch {
			// Skip inaccessible collections while preparing.
		}
	}

	return results.sort((left, right) => left.id - right.id);
}

export function createCollectionOnResource(
	origin: string,
	userId: string,
	baseResourceType: string,
	baseResourceId: string,
	name: string,
): CollaborationCollection {
	if (!isCollaborationProviderEnabled()) {
		throw new CollectionNotFoundError();
	}

	if (!canUserAccessResource(userId, baseResourceType, baseResourceId)) {
		throw new CollectionNotFoundError();
	}

	const collection: CollectionRecord = {
		id: getNextCollectionId(),
		name,
		resources: [{ type: baseResourceType, id: baseResourceId }],
	};

	registerKnownResource(baseResourceType, baseResourceId);
	getCollections().set(collection.id, collection);
	invalidateCollectionAccess(collection.id);

	return prepareCollection(origin, userId, collection);
}

export function renameCollection(
	origin: string,
	userId: string,
	collectionId: number,
	collectionName: string,
): CollaborationCollection {
	const collection = getCollectionRecord(collectionId);

	if (!canUserAccessCollection(userId, collection)) {
		throw new CollectionNotFoundError();
	}

	collection.name = collectionName;

	return prepareCollection(origin, userId, collection);
}
