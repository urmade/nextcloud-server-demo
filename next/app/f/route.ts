import { handleShowFile } from '@/src/server/files/view';

export async function GET(request: Request) {
	const url = new URL(request.url);

	return handleShowFile(request, undefined, {
		opendetails: url.searchParams.get('opendetails'),
		openfile: url.searchParams.get('openfile'),
	});
}
