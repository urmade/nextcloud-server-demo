import { handleAcceptPost, handleShowAccept } from '@/src/server/files_sharing/accept';

export async function GET(
	request: Request,
	context: { params: Promise<{ shareId: string }> },
) {
	const { shareId } = await context.params;

	return handleShowAccept(request, shareId);
}

export async function POST(
	request: Request,
	context: { params: Promise<{ shareId: string }> },
) {
	const { shareId } = await context.params;

	return handleAcceptPost(request, shareId);
}
