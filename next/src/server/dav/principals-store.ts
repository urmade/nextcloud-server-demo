import { findParityUser, getParityUsers } from '@/src/server/config/users';

export interface PrincipalRecord {
	uri: string;
	displayName: string;
	href: string;
	isCollection: boolean;
	extraProps?: Record<string, string>;
}

const DEFAULT_GROUPS: Array<{ id: string; displayName: string }> = [
	{ id: 'admin', displayName: 'admin' },
];

const SYSTEM_PRINCIPALS: Array<{ name: string; displayName: string }> = [
	{ name: 'system', displayName: 'system' },
	{ name: 'public', displayName: 'public' },
];

interface PrincipalsStoreState {
	calendarResourcesById: Map<string, PrincipalRecord>;
	calendarRoomsById: Map<string, PrincipalRecord>;
	remoteUsersById: Map<string, PrincipalRecord>;
}

const globalState = globalThis as typeof globalThis & {
	__ncDavPrincipalsStore?: PrincipalsStoreState;
};

function storeState(): PrincipalsStoreState {
	if (!globalState.__ncDavPrincipalsStore) {
		globalState.__ncDavPrincipalsStore = {
			calendarResourcesById: new Map(),
			calendarRoomsById: new Map(),
			remoteUsersById: new Map(),
		};
	}

	return globalState.__ncDavPrincipalsStore;
}

function principalHref(kind: string, id?: string): string {
	if (id) {
		return `/remote.php/dav/principals/${kind}/${id}/`;
	}

	return `/remote.php/dav/principals/${kind}/`;
}

export function isDavListingEnabled(): boolean {
	return process.env.NC_DAV_DEBUG === 'true';
}

export function listUserPrincipalRecords(): PrincipalRecord[] {
	return getParityUsers().map((user) => ({
		uri: `principals/users/${user.id}`,
		displayName: user.displayName,
		href: principalHref('users', user.id),
		isCollection: true,
	}));
}

export function findUserPrincipal(userId: string): PrincipalRecord | null {
	const user = findParityUser(userId);

	if (!user) {
		return null;
	}

	return {
		uri: `principals/users/${user.id}`,
		displayName: user.displayName,
		href: principalHref('users', user.id),
		isCollection: true,
	};
}

export function listGroupPrincipalRecords(): PrincipalRecord[] {
	return DEFAULT_GROUPS.map((group) => ({
		uri: `principals/groups/${group.id}`,
		displayName: group.displayName,
		href: principalHref('groups', group.id),
		isCollection: true,
	}));
}

export function findGroupPrincipal(groupId: string): PrincipalRecord | null {
	const group = DEFAULT_GROUPS.find((entry) => entry.id === groupId);

	if (!group) {
		return null;
	}

	return {
		uri: `principals/groups/${group.id}`,
		displayName: group.displayName,
		href: principalHref('groups', group.id),
		isCollection: true,
	};
}

export function findSystemPrincipal(name: string): PrincipalRecord | null {
	const system = SYSTEM_PRINCIPALS.find((entry) => entry.name === name);

	if (!system) {
		return null;
	}

	return {
		uri: `principals/system/${system.name}`,
		displayName: system.displayName,
		href: principalHref('system', system.name),
		isCollection: true,
	};
}

export function findCalendarResourcePrincipal(id: string): PrincipalRecord | null {
	return storeState().calendarResourcesById.get(id) ?? null;
}

export function findCalendarRoomPrincipal(id: string): PrincipalRecord | null {
	return storeState().calendarRoomsById.get(id) ?? null;
}

export function findRemoteUserPrincipal(id: string): PrincipalRecord | null {
	return storeState().remoteUsersById.get(id) ?? null;
}

export function findRemoteUserPrincipalByCloudId(cloudId: string): PrincipalRecord | null {
	const { remoteUsersById } = storeState();

	for (const record of remoteUsersById.values()) {
		if (record.extraProps?.['{http://nextcloud.com/ns}cloud-id'] === cloudId) {
			return record;
		}
	}

	return remoteUsersById.get(cloudId) ?? null;
}

export function seedCalendarResourcePrincipal(id: string, displayName: string): PrincipalRecord {
	const record: PrincipalRecord = {
		uri: `principals/calendar-resources/${id}`,
		displayName,
		href: principalHref('calendar-resources', id),
		isCollection: true,
	};

	storeState().calendarResourcesById.set(id, record);

	return record;
}

export function seedCalendarRoomPrincipal(id: string, displayName: string): PrincipalRecord {
	const record: PrincipalRecord = {
		uri: `principals/calendar-rooms/${id}`,
		displayName,
		href: principalHref('calendar-rooms', id),
		isCollection: true,
	};

	storeState().calendarRoomsById.set(id, record);

	return record;
}

export function seedRemoteUserPrincipal(id: string, displayName: string, cloudId: string): PrincipalRecord {
	const record: PrincipalRecord = {
		uri: `principals/remote-users/${id}`,
		displayName,
		href: principalHref('remote-users', id),
		isCollection: true,
		extraProps: {
			'{http://nextcloud.com/ns}cloud-id': cloudId,
		},
	};

	storeState().remoteUsersById.set(id, record);

	return record;
}

export function resetPrincipalsStore(): void {
	const state = storeState();

	state.calendarResourcesById.clear();
	state.calendarRoomsById.clear();
	state.remoteUsersById.clear();
}
