import { isUserInGroup } from '@/src/server/config/groups';
import {
	SHARE_STATUS_ACCEPTED,
	SHARE_STATUS_PENDING,
	SHARE_TYPE_GROUP,
	SHARE_TYPE_USER,
} from './constants';
import type { ExternalShareRecord } from './types';

let nextExternalShareId = 1;
const externalShares: ExternalShareRecord[] = [];

export function resetExternalShareStore(): void {
	nextExternalShareId = 1;
	externalShares.length = 0;
}

export function seedParityExternalShare(input: Omit<ExternalShareRecord, 'id'> & { id?: string }): ExternalShareRecord {
	const share: ExternalShareRecord = {
		id: input.id ?? String(nextExternalShareId++),
		parent: input.parent ?? '-1',
		shareType: input.shareType,
		remote: input.remote,
		remoteId: input.remoteId,
		refreshToken: input.refreshToken,
		password: input.password ?? null,
		accessToken: input.accessToken ?? null,
		accessTokenExpires: input.accessTokenExpires ?? null,
		name: input.name,
		owner: input.owner,
		user: input.user,
		mountpoint: input.mountpoint,
		accepted: input.accepted,
	};

	if (!input.id) {
		nextExternalShareId = Math.max(nextExternalShareId, Number.parseInt(share.id, 10) + 1);
	}

	externalShares.push(share);

	return share;
}

function canAccessShare(share: ExternalShareRecord, userId: string): boolean {
	if (share.shareType === SHARE_TYPE_USER) {
		return share.user === userId;
	}

	if (share.shareType === SHARE_TYPE_GROUP) {
		return isUserInGroup(userId, share.user);
	}

	return false;
}

export function getExternalShareById(id: string, userId: string): ExternalShareRecord | undefined {
	const share = externalShares.find((entry) => entry.id === id);

	if (!share || !canAccessShare(share, userId)) {
		return undefined;
	}

	return share;
}

function listAccessibleShares(userId: string): ExternalShareRecord[] {
	const shares = externalShares.filter((share) => canAccessShare(share, userId));
	const subShareParents = new Set(
		shares
			.filter((share) => share.shareType === SHARE_TYPE_GROUP && share.parent !== '-1')
			.map((share) => share.parent),
	);

	return shares.filter((share) => !subShareParents.has(share.id));
}

export function listExternalSharesForUser(userId: string, status: number): ExternalShareRecord[] {
	return listAccessibleShares(userId).filter((share) => share.accepted === status);
}

export function acceptExternalShare(id: string, userId: string): boolean {
	const share = getExternalShareById(id, userId);

	if (!share || share.accepted !== SHARE_STATUS_PENDING) {
		return false;
	}

	if (share.shareType === SHARE_TYPE_USER && share.user !== userId) {
		return false;
	}

	share.accepted = SHARE_STATUS_ACCEPTED;

	if (!share.mountpoint || share.mountpoint.startsWith('{{TemporaryMountPointName#')) {
		share.mountpoint = share.name;
	}

	return true;
}

export function declineExternalShare(id: string, userId: string): boolean {
	const share = getExternalShareById(id, userId);

	if (!share || share.accepted !== SHARE_STATUS_PENDING) {
		return false;
	}

	if (share.shareType === SHARE_TYPE_USER) {
		const index = externalShares.findIndex((entry) => entry.id === share.id);

		if (index >= 0) {
			externalShares.splice(index, 1);
		}

		return true;
	}

	return false;
}

export function removeExternalShare(id: string, userId: string): boolean {
	const share = getExternalShareById(id, userId);

	if (!share || share.accepted !== SHARE_STATUS_ACCEPTED) {
		return false;
	}

	const index = externalShares.findIndex((entry) => entry.id === share.id);

	if (index < 0) {
		return false;
	}

	externalShares.splice(index, 1);

	return true;
}

export function canRemoveExternalShareMount(id: string, userId: string): boolean {
	const share = getExternalShareById(id, userId);

	return Boolean(share && share.accepted === SHARE_STATUS_ACCEPTED && share.mountpoint);
}
