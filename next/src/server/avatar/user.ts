import { getAvatarFixture, getGuestAvatarFixture } from '@/src/server/fixtures/binary';
import { binaryResponse, cacheForSeconds, jsonArrayResponse, normalizeAvatarSize } from '@/src/server/http/binary';
import { getGuestAvatarResponse } from '@/src/server/avatar/guest';
import { getCustomAvatar, hasAvatarRemoved } from '@/src/server/avatar/store';

export function getUserAvatarResponse(
	userId: string,
	size: number,
	dark = false,
	guestFallback = false,
): Response {
	const normalizedSize = normalizeAvatarSize(size);
	const customAvatar = getCustomAvatar(userId);

	if (customAvatar) {
		const response = binaryResponse(customAvatar.bytes, 200, customAvatar.mimeType, {
			'x-nc-iscustomavatar': '1',
		});

		return cacheForSeconds(response, 60 * 60 * 24);
	}

	if (hasAvatarRemoved(userId)) {
		if (guestFallback) {
			return getGuestAvatarResponse(userId, normalizedSize, dark);
		}

		return jsonArrayResponse(404);
	}

	const bytes = getAvatarFixture(userId, normalizedSize, dark);

	if (!bytes) {
		if (guestFallback) {
			return getGuestAvatarResponse(userId, normalizedSize, dark);
		}

		return jsonArrayResponse(404);
	}

	const response = binaryResponse(bytes, 200, 'image/png', {
		'x-nc-iscustomavatar': '0',
	});

	return cacheForSeconds(response, 60 * 60 * 24);
}
