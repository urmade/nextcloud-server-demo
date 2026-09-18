import { handleDownloadShare } from '@/src/server/files_sharing/public-link';

export async function GET(
	request: Request,
	context: { params: Promise<{ token: string; filename?: string[] }> },
) {
	const { token, filename } = await context.params;
	const fileSegment = filename?.join('/') ?? '';

	return handleDownloadShare(request, token, fileSegment);
}
