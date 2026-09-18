import { handleSearchCollections } from '@/src/server/collaboration-resources/api';

export async function GET(
	request: Request,
	context: { params: Promise<{ filter: string }> },
) {
	const { filter } = await context.params;

	return handleSearchCollections(request, decodeURIComponent(filter));
}
