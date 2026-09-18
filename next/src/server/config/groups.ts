import { findParityUser } from './users';

export interface ParityGroup {
	id: string;
	displayName: string;
	members: string[];
}

const DEFAULT_GROUPS: ParityGroup[] = [
	{
		id: 'parity-users',
		displayName: 'Parity Users',
		members: ['admin', 'alice'],
	},
];

export function getParityGroups(): ParityGroup[] {
	return DEFAULT_GROUPS;
}

export function findParityGroup(groupId: string): ParityGroup | undefined {
	return getParityGroups().find((group) => group.id === groupId);
}

export function isUserInGroup(userId: string, groupId: string): boolean {
	const group = findParityGroup(groupId);

	if (!group) {
		return false;
	}

	return group.members.includes(userId) && findParityUser(userId) !== undefined;
}
