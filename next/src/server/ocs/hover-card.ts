import { findParityUser } from '@/src/server/config/users';

export interface HoverCardAction {
	title: string;
	icon: string;
	hyperlink: string;
	appId: string;
}

export interface HoverCardData {
	userId: string;
	displayName: string;
	actions: HoverCardAction[];
}

export function getHoverCardUser(userId: string): HoverCardData | null {
	const user = findParityUser(userId);

	if (!user) {
		return null;
	}

	return {
		userId: user.id,
		displayName: user.displayName,
		actions: [],
	};
}
