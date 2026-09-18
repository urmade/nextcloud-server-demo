import { handleResendWelcomeMessage } from '@/src/server/provisioning/users-lifecycle';

export async function POST(
	request: Request,
	context: { params: Promise<{ userId: string }> },
) {
	const { userId } = await context.params;

	return handleResendWelcomeMessage(request, userId);
}
