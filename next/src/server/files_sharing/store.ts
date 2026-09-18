import { findParityUser } from '@/src/server/config/users';
import { isUserInGroup } from '@/src/server/config/groups';
import {
	DEFAULT_SHARE_PERMISSIONS,
	PERMISSION_CREATE,
	PERMISSION_DELETE,
	PERMISSION_READ,
	PERMISSION_UPDATE,
	SHARE_STATUS_ACCEPTED,
	SHARE_STATUS_PENDING,
	SHARE_TYPE_GROUP,
	SHARE_TYPE_LINK,
	SHARE_TYPE_USER,
	TOKEN_MAX_LENGTH,
} from './constants';
import type { ShareRecord } from './types';

const DELETED_SHARE_TYPES = new Set([SHARE_TYPE_GROUP]);

const globalForShares = globalThis as typeof globalThis & {
	__ncShareStore?: ShareRecord[];
	__ncShareNextId?: number;
};

function getShares(): ShareRecord[] {
	if (!globalForShares.__ncShareStore) {
		globalForShares.__ncShareStore = [];
	}

	return globalForShares.__ncShareStore;
}

function getNextShareId(): number {
	if (!globalForShares.__ncShareNextId) {
		globalForShares.__ncShareNextId = 1;
	}

	return globalForShares.__ncShareNextId;
}

function setNextShareId(value: number): void {
	globalForShares.__ncShareNextId = value;
}

function randomToken(): string {
	if (process.env.NC_PARITY_DETERMINISTIC_SHARE_TOKENS === 'true') {
		return `parity-link-${getNextShareId()}`;
	}

	const chars = 'abcdefghijklmnopqrstuvwxyz0123456789-';
	let token = '';

	for (let index = 0; index < 15; index += 1) {
		token += chars[Math.floor(Math.random() * chars.length)];
	}

	return token;
}

export function resetShareStore(): void {
	setNextShareId(1);
	getShares().length = 0;
}

export function getShareById(id: number): ShareRecord | undefined {
	return getShares().find((share) => share.id === id);
}

export function getShareByFullId(id: string): ShareRecord | undefined {
	const match = /^ocinternal:(\d+)$/.exec(id);

	if (!match) {
		return undefined;
	}

	return getShareById(Number.parseInt(match[1], 10));
}

export function getShareByToken(token: string): ShareRecord | undefined {
	return getShares().find((share) => share.token === token && share.shareType === SHARE_TYPE_LINK);
}

export function listShares(): ShareRecord[] {
	return [...getShares()];
}

export function createShareRecord(input: {
	shareType: number;
	sharedBy: string;
	shareOwner: string;
	sharedWith: string | null;
	permissions: number;
	nodeId: number;
	path: string;
	target: string;
	token?: string | null;
	password?: string | null;
	note?: string;
	label?: string;
	status?: number;
	mailSend?: boolean;
	sendPasswordByTalk?: boolean;
	hideDownload?: boolean;
}): ShareRecord {
	const shareId = getNextShareId();
	setNextShareId(shareId + 1);
	const share: ShareRecord = {
		id: shareId,
		shareType: input.shareType,
		sharedBy: input.sharedBy,
		shareOwner: input.shareOwner,
		sharedWith: input.sharedWith,
		permissions: input.permissions,
		nodeId: input.nodeId,
		path: input.path,
		target: input.target,
		token: input.token ?? (input.shareType === SHARE_TYPE_LINK ? randomToken() : null),
		password: input.password ?? null,
		note: input.note ?? '',
		label: input.label ?? '',
		status: input.status ?? (
			(input.shareType === SHARE_TYPE_USER && input.sharedWith && input.sharedWith !== input.sharedBy)
				|| input.shareType === SHARE_TYPE_GROUP
				? SHARE_STATUS_PENDING
				: SHARE_STATUS_ACCEPTED
		),
		shareTime: Math.floor(Date.now() / 1000),
		expiration: null,
		hideDownload: input.hideDownload ?? false,
		mailSend: input.mailSend ?? false,
		sendPasswordByTalk: input.sendPasswordByTalk ?? false,
		deletedFromSelf: [],
	};

	getShares().push(share);

	return share;
}

export function updateShareRecord(id: number, patch: Partial<ShareRecord>): ShareRecord | undefined {
	const share = getShareById(id);

	if (!share) {
		return undefined;
	}

	Object.assign(share, patch);

	return share;
}

export function deleteShareRecord(id: number): boolean {
	const index = getShares().findIndex((share) => share.id === id);

	if (index < 0) {
		return false;
	}

	getShares().splice(index, 1);

	return true;
}

export function deleteShareFromSelf(id: number, userId: string): boolean {
	const share = getShareById(id);

	if (!share) {
		return false;
	}

	if (!share.deletedFromSelf.includes(userId)) {
		share.deletedFromSelf.push(userId);
	}

	return true;
}

export function generateShareToken(): string {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		const token = randomToken();

		if (token.length <= TOKEN_MAX_LENGTH && !getShares().some((share) => share.token === token)) {
			return token;
		}
	}

	throw new Error('Failed to generate a unique token');
}

export function computeDefaultPermissions(shareType: number, nodeKind: 'file' | 'directory'): number {
	let permissions = DEFAULT_SHARE_PERMISSIONS;

	if (nodeKind === 'file') {
		permissions &= ~(PERMISSION_DELETE | PERMISSION_CREATE);
	}

	if (shareType !== SHARE_TYPE_LINK) {
		permissions |= PERMISSION_READ;
	}

	return permissions;
}

export function computeLinkPermissions(
	permissions: number | null | undefined,
	publicUpload: boolean,
): number {
	if (publicUpload) {
		return PERMISSION_READ | PERMISSION_CREATE | PERMISSION_UPDATE | PERMISSION_DELETE;
	}

	if (permissions === null || permissions === undefined) {
		return PERMISSION_READ;
	}

	return permissions | PERMISSION_READ;
}

export function listPendingSharesForUser(userId: string): ShareRecord[] {
	return getShares().filter((share) => (
		(share.shareType === SHARE_TYPE_USER || share.shareType === SHARE_TYPE_GROUP)
		&& share.sharedWith === userId
		&& (share.status === SHARE_STATUS_PENDING || share.status === 2)
	));
}

export function acceptShareRecord(id: number, userId: string): boolean {
	const share = getShareById(id);

	if (!share) {
		return false;
	}

	if (share.shareType === SHARE_TYPE_USER) {
		if (share.sharedWith !== userId) {
			return false;
		}
	} else if (share.shareType === SHARE_TYPE_GROUP) {
		if (!share.sharedWith || !isUserInGroup(userId, share.sharedWith)) {
			return false;
		}
	} else {
		return false;
	}

	share.status = SHARE_STATUS_ACCEPTED;

	return true;
}

export function getSharesCreatedBy(userId: string): ShareRecord[] {
	return getShares().filter((share) => share.sharedBy === userId);
}

export function getSharesSharedWith(userId: string): ShareRecord[] {
	return getShares().filter((share) => (
		share.sharedWith === userId
		&& !share.deletedFromSelf.includes(userId)
	));
}

export function listDeletedSharesForUser(userId: string): ShareRecord[] {
	return getShares().filter((share) => {
		if (!DELETED_SHARE_TYPES.has(share.shareType) || !share.deletedFromSelf.includes(userId)) {
			return false;
		}

		if (!findParityUser(share.shareOwner)) {
			return false;
		}

		if (share.shareType === SHARE_TYPE_GROUP && share.sharedWith) {
			return isUserInGroup(userId, share.sharedWith);
		}

		return false;
	});
}

export function restoreDeletedShare(id: number, userId: string): boolean {
	const share = getShareById(id);

	if (!share) {
		return false;
	}

	const index = share.deletedFromSelf.indexOf(userId);

	if (index < 0) {
		return false;
	}

	share.deletedFromSelf.splice(index, 1);

	return true;
}
