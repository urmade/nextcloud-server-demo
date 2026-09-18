import { getUserAvatarResponse } from '@/src/server/avatar/user';

export async function GET(
	request: Request,
	context: { params: Promise<{ userId: string; size: string }> },
) {
	const { userId, size } = await context.params;
	const url = new URL(request.url);
	const guestFallback = url.searchParams.get('guestFallback') === 'true';

	return getUserAvatarResponse(userId, Number.parseInt(size, 10), false, guestFallback);
}
