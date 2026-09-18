import { handleDirectTokenRequest } from '@/src/server/dav/direct';

export async function GET(
	request: Request,
	context: { params: Promise<{ token: string }> },
) {
	const { token } = await context.params;

	return handleDirectTokenRequest(request, token);
}

export async function HEAD(
	request: Request,
	context: { params: Promise<{ token: string }> },
) {
	const { token } = await context.params;

	return handleDirectTokenRequest(request, token);
}

export async function PUT(
	request: Request,
	context: { params: Promise<{ token: string }> },
) {
	const { token } = await context.params;

	return handleDirectTokenRequest(request, token);
}

export async function DELETE(
	request: Request,
	context: { params: Promise<{ token: string }> },
) {
	const { token } = await context.params;

	return handleDirectTokenRequest(request, token);
}
