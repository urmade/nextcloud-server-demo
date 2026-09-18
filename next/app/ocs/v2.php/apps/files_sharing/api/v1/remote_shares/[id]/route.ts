import {
	handleGetRemoteShare,
	handleUnshareRemoteShare,
} from '@/src/server/files_sharing/remote-share-api';

export function GET(
	request: Request,
	context: { params: Promise<{ id: string }> },
) {
	return context.params.then(({ id }) => handleGetRemoteShare(request, id));
}

export function DELETE(
	request: Request,
	context: { params: Promise<{ id: string }> },
) {
	return context.params.then(({ id }) => handleUnshareRemoteShare(request, id));
}
