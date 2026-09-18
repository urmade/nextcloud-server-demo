import { getGuestAvatarFixture } from '@/src/server/fixtures/binary';
import { binaryResponse, cacheForSeconds, normalizeAvatarSize } from '@/src/server/http/binary';

export function getGuestAvatarResponse(
	guestName: string,
	size: number,
	dark = false,
): Response {
	if (!guestName) {
		return new Response(null, { status: 500 });
	}

	const normalizedSize = normalizeAvatarSize(size);
	const bytes = getGuestAvatarFixture(dark);
	const response = binaryResponse(bytes, 201, 'image/png', {
		'x-nc-iscustomavatar': '0',
	});

	return cacheForSeconds(response, 1800);
}
