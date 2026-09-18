import { handleUndeleteShare } from '@/src/server/files_sharing/deleted-share-api';

export function POST(
	request: Request,
	context: { params: Promise<{ id: string }> },
) {
	return context.params.then(({ id }) => handleUndeleteShare(request, id));
}
