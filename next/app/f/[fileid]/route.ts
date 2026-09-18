import { handleShowFile } from '@/src/server/files/view';

export async function GET(
	request: Request,
	context: { params: Promise<{ fileid: string }> },
) {
	const { fileid } = await context.params;
	const url = new URL(request.url);

	return handleShowFile(request, fileid, {
		opendetails: url.searchParams.get('opendetails'),
		openfile: url.searchParams.get('openfile'),
	});
}
