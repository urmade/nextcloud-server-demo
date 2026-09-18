export const PARITY_ROOM_RESOURCE_TYPE = 'parity-room';
export const PARITY_ROOM_ACCESSIBLE_ID = 'room-1';
export const PARITY_ROOM_ACCESSIBLE_ID_2 = 'room-2';
export const PARITY_ROOM_INACCESSIBLE_ID = 'room-secret';

export interface ParityCollaborationResource {
	type: string;
	id: string;
	name: string;
	accessibleUserIds: string[];
}

const PARITY_RESOURCES: ParityCollaborationResource[] = [
	{
		type: PARITY_ROOM_RESOURCE_TYPE,
		id: PARITY_ROOM_ACCESSIBLE_ID,
		name: 'Parity Room',
		accessibleUserIds: ['admin', 'alice'],
	},
	{
		type: PARITY_ROOM_RESOURCE_TYPE,
		id: PARITY_ROOM_ACCESSIBLE_ID_2,
		name: 'Parity Room Two',
		accessibleUserIds: ['admin', 'alice'],
	},
	{
		type: PARITY_ROOM_RESOURCE_TYPE,
		id: PARITY_ROOM_INACCESSIBLE_ID,
		name: 'Secret Room',
		accessibleUserIds: [],
	},
];

export function isCollaborationProviderEnabled(): boolean {
	const value = process.env.NC_PARITY_COLLABORATION_PROVIDER?.trim().toLowerCase();

	return value !== 'false' && value !== '0';
}

export function findParityCollaborationResource(
	type: string,
	id: string,
): ParityCollaborationResource | null {
	if (!isCollaborationProviderEnabled()) {
		return null;
	}

	return PARITY_RESOURCES.find((resource) => resource.type === type && resource.id === id) ?? null;
}

export function buildResourceLink(origin: string, type: string, id: string): string {
	return `${origin}/parity/${type}/${id}`;
}
