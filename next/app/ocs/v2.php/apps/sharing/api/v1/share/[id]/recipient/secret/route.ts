import { handleUpdateShareRecipientSecret } from '@/src/server/sharing/api-v1';

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
	const { id } = await context.params;

	return handleUpdateShareRecipientSecret(request, id);
}
