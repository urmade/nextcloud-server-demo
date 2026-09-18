import { handleAuthenticate, handleShowAuthenticate } from '@/src/server/files_sharing/public-link';

export async function GET(
	request: Request,
	context: { params: Promise<{ token: string; redirect: string }> },
) {
	const { token } = await context.params;

	return handleShowAuthenticate(request, token);
}

export async function POST(
	request: Request,
	context: { params: Promise<{ token: string; redirect: string }> },
) {
	const { token, redirect } = await context.params;

	return handleAuthenticate(request, token, redirect);
}
