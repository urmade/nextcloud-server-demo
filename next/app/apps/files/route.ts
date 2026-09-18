import { handleFilesViewIndex } from '@/src/server/files/view';

export async function GET(request: Request) {
	const url = new URL(request.url);

	return handleFilesViewIndex(request, {
		dir: url.searchParams.get('dir') ?? '',
		view: url.searchParams.get('view') ?? '',
		fileid: url.searchParams.get('fileid'),
	});
}
