import { handleInvitationDecline } from '@/src/server/dav/invitation-html';

export async function GET(
	_request: Request,
	context: { params: Promise<{ token: string }> },
) {
	const { token } = await context.params;

	return handleInvitationDecline(token);
}
