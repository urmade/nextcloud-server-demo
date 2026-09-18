import { findParityUser } from '@/src/server/config/users';

export type SharingState = 'active' | 'draft' | 'deleted';
export type SharingUserStatus = 'pending' | 'accepted' | 'rejected';

export interface SharingShareRecord {
	id: string;
	ownerId: string;
	lastUpdatedMs: string;
	state: SharingState;
	userStatus: SharingUserStatus | null;
}

const globalForSharing = globalThis as typeof globalThis & {
	__ncSharingV1Store?: SharingShareRecord[];
	__ncSharingV1NextId?: number;
};

function getShares(): SharingShareRecord[] {
	if (!globalForSharing.__ncSharingV1Store) {
		globalForSharing.__ncSharingV1Store = [];
	}

	return globalForSharing.__ncSharingV1Store;
}

function nextShareId(): string {
	if (!globalForSharing.__ncSharingV1NextId) {
		globalForSharing.__ncSharingV1NextId = 1;
	}

	const id = globalForSharing.__ncSharingV1NextId;
	globalForSharing.__ncSharingV1NextId += 1;

	if (process.env.NC_PARITY_DETERMINISTIC_SHARE_TOKENS === 'true') {
		return String(1_700_000_000_000_000 + id);
	}

	return String(Date.now() * 1_000 + id);
}

export function resetSharingV1Store(): void {
	globalForSharing.__ncSharingV1NextId = 1;
	getShares().length = 0;
}

export function seedSharingShare(share: SharingShareRecord): void {
	const existing = getSharingShareById(share.id);

	if (!existing) {
		getShares().push(share);
	}
}

export function createSharingShare(ownerId: string): SharingShareRecord {
	const share: SharingShareRecord = {
		id: nextShareId(),
		ownerId,
		lastUpdatedMs: String(Date.now()),
		state: 'draft',
		userStatus: null,
	};

	getShares().push(share);

	return share;
}

export function getSharingShareById(id: string): SharingShareRecord | undefined {
	return getShares().find((share) => share.id === id);
}

export function listSharingShares(
	userId: string,
	lastShareId: string | null,
	limit: number,
): SharingShareRecord[] {
	const owned = getShares()
		.filter((share) => share.ownerId === userId)
		.filter((share) => lastShareId === null || share.id > lastShareId)
		.sort((left, right) => left.id.localeCompare(right.id))
		.slice(0, limit);

	return owned;
}

export function deleteSharingShare(id: string): boolean {
	const index = getShares().findIndex((share) => share.id === id);

	if (index < 0) {
		return false;
	}

	getShares().splice(index, 1);

	return true;
}

export function formatSharingOwner(request: Request, userId: string) {
	const user = findParityUser(userId);
	const origin = new URL(request.url).origin;

	return {
		user_id: userId,
		instance: null,
		display_name: user?.displayName ?? userId,
		icon: {
			light: `${origin}/index.php/avatar/${userId}/64`,
			dark: `${origin}/index.php/avatar/${userId}/64/dark`,
		},
	};
}

export function formatSharingShare(request: Request, share: SharingShareRecord) {
	return {
		id: share.id,
		owner: formatSharingOwner(request, share.ownerId),
		last_updated: share.lastUpdatedMs,
		state: share.state,
		user_status: share.userStatus,
		sources: [],
		recipients: [],
		properties: [],
		permissions: [],
		permission_preset: null,
	};
}
