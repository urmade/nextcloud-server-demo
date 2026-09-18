import { handleUpdateFileTags } from '@/src/server/files/api';

export async function POST(
	request: Request,
	context: { params: Promise<{ path: string[] }> },
) {
	const { path } = await context.params;
	const filePath = path.map((segment) => decodeURIComponent(segment)).join('/');

	return handleUpdateFileTags(request, filePath);
}
