import { getGuestAvatarResponse } from '@/src/server/avatar/guest';

export async function GET(
	request: Request,
	context: { params: Promise<{ guestName: string; size: string }> },
) {
	const { guestName, size } = await context.params;
	const url = new URL(request.url);
	const darkTheme = url.searchParams.get('darkTheme') === 'true';

	return getGuestAvatarResponse(guestName, Number.parseInt(size, 10), darkTheme);
}
