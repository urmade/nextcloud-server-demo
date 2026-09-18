import { handleDeleteShare, handleGetShare, handleUpdateShare } from '@/src/server/files_sharing/share-api';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
	const { id } = await context.params;

	return handleGetShare(request, id);
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
	const { id } = await context.params;

	return handleUpdateShare(request, id);
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
	const { id } = await context.params;

	return handleDeleteShare(request, id);
}
