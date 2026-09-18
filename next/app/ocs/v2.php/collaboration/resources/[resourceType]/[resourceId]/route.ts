import {
	handleCreateCollectionOnResource,
	handleGetCollectionsByResource,
} from '@/src/server/collaboration-resources/api';

export async function GET(
	request: Request,
	context: { params: Promise<{ resourceType: string; resourceId: string }> },
) {
	const { resourceType, resourceId } = await context.params;

	return handleGetCollectionsByResource(
		request,
		decodeURIComponent(resourceType),
		decodeURIComponent(resourceId),
	);
}

export async function POST(
	request: Request,
	context: { params: Promise<{ resourceType: string; resourceId: string }> },
) {
	const { resourceType, resourceId } = await context.params;

	return await handleCreateCollectionOnResource(
		request,
		decodeURIComponent(resourceType),
		decodeURIComponent(resourceId),
	);
}
