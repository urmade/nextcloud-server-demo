import { handleFilesViewIndex } from '@/src/server/files/view';

export async function GET(
	request: Request,
	context: { params: Promise<{ view: string }> },
) {
	const { view } = await context.params;
	const url = new URL(request.url);

	return handleFilesViewIndex(request, {
		dir: url.searchParams.get('dir') ?? '',
		view,
		fileid: url.searchParams.get('fileid'),
	});
}
