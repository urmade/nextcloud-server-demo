import { handleEnableUser } from '@/src/server/provisioning/users-lifecycle';

export async function PUT(
	request: Request,
	context: { params: Promise<{ userId: string }> },
) {
	const { userId } = await context.params;

	return handleEnableUser(request, userId);
}
