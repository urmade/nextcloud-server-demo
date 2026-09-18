import {
	handleAddShareRecipient,
	handleRemoveShareRecipient,
} from '@/src/server/sharing/api-v1';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
	const { id } = await context.params;

	return handleAddShareRecipient(request, id);
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
	const { id } = await context.params;

	return handleRemoveShareRecipient(request, id);
}
