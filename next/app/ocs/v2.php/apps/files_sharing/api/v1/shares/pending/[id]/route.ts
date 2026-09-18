import { handleAcceptShare } from '@/src/server/files_sharing/share-api';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
	const { id } = await context.params;

	return handleAcceptShare(request, id);
}
