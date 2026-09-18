import {
	handleAcceptRemoteShare,
	handleDeclineRemoteShare,
} from '@/src/server/files_sharing/remote-share-api';

export function POST(
	request: Request,
	context: { params: Promise<{ id: string }> },
) {
	return context.params.then(({ id }) => handleAcceptRemoteShare(request, id));
}

export function DELETE(
	request: Request,
	context: { params: Promise<{ id: string }> },
) {
	return context.params.then(({ id }) => handleDeclineRemoteShare(request, id));
}
