import { handleShowVerifyMail, handleVerifyMailPost } from '@/src/server/provisioning/mail-verify';

export async function GET(
	request: Request,
	context: { params: Promise<{ key: string; token: string; userId: string }> },
) {
	const { key, token, userId } = await context.params;

	return handleShowVerifyMail(
		request,
		decodeURIComponent(key),
		decodeURIComponent(token),
		decodeURIComponent(userId),
	);
}

export async function POST(
	request: Request,
	context: { params: Promise<{ key: string; token: string; userId: string }> },
) {
	const { key, token, userId } = await context.params;

	return handleVerifyMailPost(
		request,
		decodeURIComponent(key),
		decodeURIComponent(token),
		decodeURIComponent(userId),
	);
}
