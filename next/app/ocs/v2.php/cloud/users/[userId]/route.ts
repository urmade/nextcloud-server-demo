import { handleGetUser } from '@/src/server/provisioning/self-read';
import { handleDeleteUser } from '@/src/server/provisioning/users-lifecycle';
import { handleEditUser, handleEditUserMultiField } from '@/src/server/provisioning/users-edit';

export async function GET(
	request: Request,
	context: { params: Promise<{ userId: string }> },
) {
	const { userId } = await context.params;

	return handleGetUser(request, userId);
}

export async function PUT(
	request: Request,
	context: { params: Promise<{ userId: string }> },
) {
	const { userId } = await context.params;

	return handleEditUser(request, userId);
}

export async function PATCH(
	request: Request,
	context: { params: Promise<{ userId: string }> },
) {
	const { userId } = await context.params;

	return handleEditUserMultiField(request, userId);
}

export async function DELETE(
	request: Request,
	context: { params: Promise<{ userId: string }> },
) {
	const { userId } = await context.params;

	return handleDeleteUser(request, userId);
}
