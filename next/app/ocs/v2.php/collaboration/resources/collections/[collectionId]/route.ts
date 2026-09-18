import {
	handleAddResource,
	handleListCollection,
	handleRemoveResource,
	handleRenameCollection,
} from '@/src/server/collaboration-resources/api';

export async function GET(
	request: Request,
	context: { params: Promise<{ collectionId: string }> },
) {
	const { collectionId } = await context.params;

	return handleListCollection(request, Number.parseInt(collectionId, 10));
}

export async function POST(
	request: Request,
	context: { params: Promise<{ collectionId: string }> },
) {
	const { collectionId } = await context.params;

	return await handleAddResource(request, Number.parseInt(collectionId, 10));
}

export async function PUT(
	request: Request,
	context: { params: Promise<{ collectionId: string }> },
) {
	const { collectionId } = await context.params;

	return await handleRenameCollection(request, Number.parseInt(collectionId, 10));
}

export async function DELETE(
	request: Request,
	context: { params: Promise<{ collectionId: string }> },
) {
	const { collectionId } = await context.params;
	const url = new URL(request.url);
	const resourceType = url.searchParams.get('resourceType') ?? '';
	const resourceId = url.searchParams.get('resourceId') ?? '';

	return handleRemoveResource(
		request,
		Number.parseInt(collectionId, 10),
		resourceType,
		resourceId,
	);
}
