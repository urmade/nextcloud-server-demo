import { handleGetPreview } from '@/src/server/files_sharing/public-preview';

export async function GET(
	request: Request,
	context: { params: Promise<{ token: string }> },
) {
	const { token } = await context.params;

	return handleGetPreview(request, token);
}
