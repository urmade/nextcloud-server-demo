import type { ParsedImage } from '@/src/server/avatar/image';

type AvatarState = ParsedImage | 'removed';

const customAvatars = new Map<string, AvatarState>();

export function getCustomAvatar(userId: string): ParsedImage | null {
	const state = customAvatars.get(userId);

	if (!state || state === 'removed') {
		return null;
	}

	return state;
}

export function hasAvatarRemoved(userId: string): boolean {
	return customAvatars.get(userId) === 'removed';
}

export function setCustomAvatar(userId: string, image: ParsedImage): void {
	customAvatars.set(userId, image);
}

export function removeCustomAvatar(userId: string): void {
	customAvatars.set(userId, 'removed');
}

export function resetAvatarStore(): void {
	customAvatars.clear();
}
