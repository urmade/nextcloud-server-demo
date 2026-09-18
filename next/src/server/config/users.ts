export interface ParityUser {
	id: string;
	displayName: string;
	label: string;
}

const DEFAULT_USERS: ParityUser[] = [
	{ id: 'admin', displayName: 'Admin', label: 'Admin' },
	{ id: 'alice', displayName: 'Alice', label: 'Alice A.' },
];

export function getParityUsers(): ParityUser[] {
	const raw = process.env.NC_PARITY_USERS?.trim();

	if (!raw) {
		return DEFAULT_USERS;
	}

	try {
		const parsed = JSON.parse(raw) as ParityUser[];

		if (!Array.isArray(parsed) || parsed.length === 0) {
			return DEFAULT_USERS;
		}

		return parsed;
	} catch {
		return DEFAULT_USERS;
	}
}

export function findParityUser(userId: string): ParityUser | undefined {
	return getParityUsers().find((user) => user.id === userId);
}
