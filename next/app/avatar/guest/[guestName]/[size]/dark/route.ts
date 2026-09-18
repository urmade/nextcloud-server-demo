import { getGuestAvatarResponse } from '@/src/server/avatar/guest';

export async function GET(
	_request: Request,
	context: { params: Promise<{ guestName: string; size: string }> },
) {
	const { guestName, size } = await context.params;

	return getGuestAvatarResponse(guestName, Number.parseInt(size, 10), true);
}
