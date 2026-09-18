import { handleDeleteAvatar, handlePostAvatar } from '@/src/server/avatar/write';

export async function POST(request: Request) {
	return handlePostAvatar(request);
}

export async function DELETE(request: Request) {
	return handleDeleteAvatar(request);
}
