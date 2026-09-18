import { handleShowShare } from '@/src/server/files_sharing/public-link';

export async function GET(
	request: Request,
	context: { params: Promise<{ token: string }> },
) {
	const { token } = await context.params;

	return handleShowShare(request, token);
}
