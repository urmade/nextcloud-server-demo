const globalForKnownUsers = globalThis as typeof globalThis & {
	__ncKnownUsers?: Map<string, Set<string>>;
};

function getKnownUsersMap(): Map<string, Set<string>> {
	if (!globalForKnownUsers.__ncKnownUsers) {
		globalForKnownUsers.__ncKnownUsers = new Map();
	}

	return globalForKnownUsers.__ncKnownUsers;
}

export function deleteKnownTo(knownTo: string): void {
	getKnownUsersMap().delete(knownTo);
}

export function storeIsKnownToUser(knownTo: string, contactUserId: string): void {
	const map = getKnownUsersMap();
	const contacts = map.get(knownTo) ?? new Set<string>();

	contacts.add(contactUserId);
	map.set(knownTo, contacts);
}

export function isKnownToUser(knownTo: string, contactUserId: string): boolean {
	return getKnownUsersMap().get(knownTo)?.has(contactUserId) ?? false;
}

export function resetKnownUsersStore(): void {
	globalForKnownUsers.__ncKnownUsers = new Map();
}
