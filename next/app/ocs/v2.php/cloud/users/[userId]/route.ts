import { handleGetUser } from '@/src/server/provisioning/self-read';
import { handleDeleteUser } from '@/src/server/provisioning/users-lifecycle';

export async function GET(
	request: Request,
	context: { params: Promise<{ userId: string }> },
) {
	const { userId } = await context.params;

	return handleGetUser(request, userId);
}

export async function DELETE(
	request: Request,
	context: { params: Promise<{ userId: string }> },
) {
	const { userId } = await context.params;

	return handleDeleteUser(request, userId);
}
