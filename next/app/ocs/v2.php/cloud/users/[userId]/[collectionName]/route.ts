import { handleEditUserMultiValue } from '@/src/server/provisioning/users-edit';

const COLLECTION_NAME_PATTERN = /^(?!enable$|disable$)[a-zA-Z0-9_]*$/;

export async function PUT(
	request: Request,
	context: { params: Promise<{ userId: string; collectionName: string }> },
) {
	const { userId, collectionName } = await context.params;

	if (!COLLECTION_NAME_PATTERN.test(collectionName)) {
		return new Response(null, { status: 404 });
	}

	return handleEditUserMultiValue(request, userId, collectionName);
}
