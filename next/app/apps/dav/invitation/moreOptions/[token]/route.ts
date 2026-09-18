import {
	handleInvitationOptions,
	handleInvitationProcessMoreOptions,
} from '@/src/server/dav/invitation-html';

export async function GET(
	_request: Request,
	context: { params: Promise<{ token: string }> },
) {
	const { token } = await context.params;

	return handleInvitationOptions(token);
}

export async function POST(
	request: Request,
	context: { params: Promise<{ token: string }> },
) {
	const { token } = await context.params;

	return handleInvitationProcessMoreOptions(request, token);
}
