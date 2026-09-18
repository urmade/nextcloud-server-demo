import {
	addResourceToCollection,
	CollectionNotFoundError,
	createCollectionOnResource,
	getCollectionForUser,
	getCollectionsByResource,
	removeResourceFromCollection,
	renameCollection,
	ResourceNotFoundError,
	searchCollections,
} from '@/src/server/collaboration-resources/store';
import type {
	AddResourceRequest,
	CreateCollectionRequest,
	RenameCollectionRequest,
} from '@/src/server/collaboration-resources/types';
import { requireAuthenticatedUser } from '@/src/server/ocs/auth';
import {
	ocsFailureResponse,
	ocsSuccessResponse,
	parseOcsVersion,
} from '@/src/server/ocs/respond';

function parseJsonBody<T>(request: Request): Promise<T | null> {
	return request.json().catch(() => null);
}

function getRequestOrigin(request: Request): string {
	const forwardedHost = request.headers.get('x-forwarded-host');
	const host = forwardedHost ?? request.headers.get('host') ?? '127.0.0.1:3100';
	const proto = request.headers.get('x-forwarded-proto') ?? 'http';

	return `${proto}://${host}`;
}

function collectionNotFoundResponse(request: Request): Response {
	return ocsFailureResponse(parseOcsVersion(request), 404, '', []);
}

function badRequestResponse(request: Request): Response {
	return ocsFailureResponse(parseOcsVersion(request), 400, '', []);
}

function internalErrorResponse(request: Request): Response {
	return ocsFailureResponse(parseOcsVersion(request), 500, '', []);
}

export function handleSearchCollections(request: Request, filter: string): Response {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const ocsVersion = parseOcsVersion(request);

	try {
		return ocsSuccessResponse(
			searchCollections(getRequestOrigin(request), auth, filter),
			ocsVersion,
		);
	} catch {
		return collectionNotFoundResponse(request);
	}
}

export function handleListCollection(request: Request, collectionId: number): Response {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const ocsVersion = parseOcsVersion(request);

	try {
		return ocsSuccessResponse(
			getCollectionForUser(getRequestOrigin(request), auth, collectionId),
			ocsVersion,
		);
	} catch (error) {
		if (error instanceof CollectionNotFoundError) {
			return collectionNotFoundResponse(request);
		}

		return internalErrorResponse(request);
	}
}

export async function handleAddResource(request: Request, collectionId: number): Promise<Response> {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const body = await parseJsonBody<AddResourceRequest>(request);
	const ocsVersion = parseOcsVersion(request);

	if (!body || typeof body.resourceType !== 'string' || typeof body.resourceId !== 'string') {
		return collectionNotFoundResponse(request);
	}

	try {
		return ocsSuccessResponse(
			addResourceToCollection(
				getRequestOrigin(request),
				auth,
				collectionId,
				body.resourceType,
				body.resourceId,
			),
			ocsVersion,
		);
	} catch (error) {
		if (error instanceof CollectionNotFoundError) {
			return collectionNotFoundResponse(request);
		}

		return internalErrorResponse(request);
	}
}

export function handleRemoveResource(
	request: Request,
	collectionId: number,
	resourceType: string,
	resourceId: string,
): Response {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const ocsVersion = parseOcsVersion(request);

	try {
		return ocsSuccessResponse(
			removeResourceFromCollection(
				getRequestOrigin(request),
				auth,
				collectionId,
				resourceType,
				resourceId,
			),
			ocsVersion,
		);
	} catch (error) {
		if (error instanceof CollectionNotFoundError || error instanceof ResourceNotFoundError) {
			return collectionNotFoundResponse(request);
		}

		return internalErrorResponse(request);
	}
}

export async function handleRenameCollection(request: Request, collectionId: number): Promise<Response> {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const body = await parseJsonBody<RenameCollectionRequest>(request);
	const ocsVersion = parseOcsVersion(request);

	if (!body || typeof body.collectionName !== 'string') {
		return collectionNotFoundResponse(request);
	}

	try {
		return ocsSuccessResponse(
			renameCollection(getRequestOrigin(request), auth, collectionId, body.collectionName),
			ocsVersion,
		);
	} catch (error) {
		if (error instanceof CollectionNotFoundError) {
			return collectionNotFoundResponse(request);
		}

		return internalErrorResponse(request);
	}
}

export async function handleCreateCollectionOnResource(
	request: Request,
	baseResourceType: string,
	baseResourceId: string,
): Promise<Response> {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const body = await parseJsonBody<CreateCollectionRequest>(request);
	const ocsVersion = parseOcsVersion(request);
	const name = body?.name ?? '';

	if (!name[0] || name[64] !== undefined) {
		return badRequestResponse(request);
	}

	try {
		return ocsSuccessResponse(
			createCollectionOnResource(
				getRequestOrigin(request),
				auth,
				baseResourceType,
				baseResourceId,
				name,
			),
			ocsVersion,
		);
	} catch (error) {
		if (error instanceof CollectionNotFoundError) {
			return collectionNotFoundResponse(request);
		}

		return internalErrorResponse(request);
	}
}

export function handleGetCollectionsByResource(
	request: Request,
	resourceType: string,
	resourceId: string,
): Response {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const ocsVersion = parseOcsVersion(request);

	try {
		return ocsSuccessResponse(
			getCollectionsByResource(getRequestOrigin(request), auth, resourceType, resourceId),
			ocsVersion,
		);
	} catch (error) {
		if (error instanceof CollectionNotFoundError) {
			return collectionNotFoundResponse(request);
		}

		return internalErrorResponse(request);
	}
}
