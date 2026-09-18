import { handleGetThumbnail } from '@/src/server/files/api';

export async function GET(
	request: Request,
	context: { params: Promise<{ x: string; y: string; file: string[] }> },
) {
	const { x, y, file } = await context.params;
	const filePath = file.map((segment) => decodeURIComponent(segment)).join('/');

	return handleGetThumbnail(request, x, y, filePath);
}
