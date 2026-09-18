import { handleLostPasswordResetForm } from '@/src/server/auth/lost-password';

export async function GET(
	request: Request,
	context: { params: Promise<{ token: string; userId: string }> },
) {
	const { token, userId } = await context.params;

	return handleLostPasswordResetForm(request, decodeURIComponent(token), decodeURIComponent(userId));
}
