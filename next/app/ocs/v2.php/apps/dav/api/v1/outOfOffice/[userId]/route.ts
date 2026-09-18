import {
	handleClearOutOfOffice,
	handleGetOutOfOffice,
	handleSetOutOfOffice,
} from '@/src/server/dav/out-of-office';

export async function GET(
	request: Request,
	context: { params: Promise<{ userId: string }> },
) {
	const { userId } = await context.params;

	return handleGetOutOfOffice(request, userId);
}

export async function POST(request: Request) {
	return handleSetOutOfOffice(request);
}

export async function DELETE(request: Request) {
	return handleClearOutOfOffice(request);
}
