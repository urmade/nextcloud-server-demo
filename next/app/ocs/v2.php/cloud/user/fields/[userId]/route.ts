import { handleGetEditableFieldsForUser } from '@/src/server/provisioning/self-read';

export async function GET(
	request: Request,
	context: { params: Promise<{ userId: string }> },
) {
	const { userId } = await context.params;

	return handleGetEditableFieldsForUser(request, userId);
}
