import { handleLostPasswordSetPassword } from '@/src/server/auth/lost-password';

export async function POST(
	request: Request,
	context: { params: Promise<{ token: string; userId: string }> },
) {
	const { token, userId } = await context.params;
	const body = await request.text();

	return handleLostPasswordSetPassword(
		request,
		decodeURIComponent(token),
		decodeURIComponent(userId),
		body,
	);
}
