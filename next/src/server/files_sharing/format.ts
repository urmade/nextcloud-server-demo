import { findParityUser } from '@/src/server/config/users';
import { findParityGroup } from '@/src/server/config/groups';
import {
	PERMISSION_DELETE,
	PERMISSION_UPDATE,
	SHARE_TYPE_GROUP,
	SHARE_TYPE_LINK,
	SHARE_TYPE_USER,
} from './constants';
import { getNodeParentId, nodeHasPreview, resolveUserNode } from './nodes';
import type { FormattedDeletedShare, FormattedShare, ShareRecord } from './types';

function displayNameForUser(userId: string): string {
	return findParityUser(userId)?.displayName ?? userId;
}

function formatPasswordField(password: string | null): boolean {
	return password !== null && password !== '';
}

export function formatShare(
	share: ShareRecord,
	userId: string,
	origin: string,
	overrides: Partial<FormattedShare> = {},
): FormattedShare | null {
	const located = resolveUserNode(userId, share.nodeId);

	if (!located) {
		return null;
	}

	const { node, path } = located;
	const isOwnShare = share.shareOwner === userId;
	const canEdit = share.sharedBy === userId || share.shareOwner === userId;
	const canDelete = canEdit || (share.shareType === SHARE_TYPE_USER && share.sharedWith === userId);

	let itemPermissions = share.permissions;

	if (!isOwnShare) {
		itemPermissions = share.permissions;

		if (canDelete) {
			itemPermissions |= PERMISSION_DELETE;
		}

		if (canEdit) {
			itemPermissions |= PERMISSION_UPDATE;
		}
	} else {
		itemPermissions = 27;
	}

	const formatted: FormattedShare = {
		id: share.id,
		share_type: share.shareType,
		uid_owner: share.sharedBy,
		displayname_owner: displayNameForUser(share.sharedBy),
		permissions: share.permissions,
		can_edit: canEdit,
		can_delete: canDelete,
		stime: share.shareTime,
		parent: null,
		expiration: share.expiration,
		token: share.token,
		uid_file_owner: share.shareOwner,
		note: share.note,
		label: share.label,
		displayname_file_owner: displayNameForUser(share.shareOwner),
		path,
		item_type: node.kind === 'directory' ? 'folder' : 'file',
		item_permissions: itemPermissions,
		'is-mount-root': false,
		'mount-type': '',
		mimetype: node.contentType ?? 'application/octet-stream',
		has_preview: nodeHasPreview(node),
		storage_id: 'home::admin',
		storage: 1,
		item_source: node.fileId,
		file_source: node.fileId,
		file_parent: getNodeParentId(node),
		file_target: share.target,
		item_size: node.size ?? 0,
		item_mtime: node.mtime ?? 0,
	};

	if (share.shareType === SHARE_TYPE_USER && share.sharedWith) {
		formatted.share_with = share.sharedWith;
		formatted.share_with_displayname = displayNameForUser(share.sharedWith);
		formatted.share_with_displayname_unique = share.sharedWith;
	}

	if (share.shareType === SHARE_TYPE_LINK) {
		formatted.share_with = formatPasswordField(share.password) ? '***' : '';
		formatted.share_with_displayname = '(Shared link)';
		formatted.password = formatPasswordField(share.password);
		formatted.send_password_by_talk = share.sendPasswordByTalk;
		formatted.token = share.token;
		formatted.url = share.token ? `${origin}/s/${share.token}` : undefined;
	}

	return {
		...formatted,
		...overrides,
	};
}

export function formatDeletedShare(share: ShareRecord, _userId: string): FormattedDeletedShare | null {
	const located = resolveUserNode(share.sharedBy, share.nodeId);

	if (!located) {
		return null;
	}

	const { node, path } = located;
	const formatted: FormattedDeletedShare = {
		id: `ocinternal:${share.id}`,
		share_type: share.shareType,
		uid_owner: share.sharedBy,
		displayname_owner: displayNameForUser(share.sharedBy),
		permissions: 0,
		stime: share.shareTime,
		parent: null,
		expiration: share.expiration,
		token: null,
		uid_file_owner: share.shareOwner,
		displayname_file_owner: displayNameForUser(share.shareOwner),
		path,
		item_type: node.kind === 'directory' ? 'folder' : 'file',
		mimetype: node.contentType ?? 'application/octet-stream',
		storage_id: 'home::admin',
		storage: 1,
		item_source: node.fileId,
		file_source: node.fileId,
		file_parent: getNodeParentId(node),
		file_target: share.target,
		item_size: node.size ?? 0,
		item_mtime: node.mtime ?? 0,
	};

	if (share.shareType === SHARE_TYPE_GROUP && share.sharedWith) {
		const group = findParityGroup(share.sharedWith);
		formatted.share_with = share.sharedWith;
		formatted.share_with_displayname = group?.displayName ?? share.sharedWith;
	}

	return formatted;
}

export function formatShares(
	shares: ShareRecord[],
	userId: string,
	origin: string,
): FormattedShare[] {
	const formatted: FormattedShare[] = [];

	for (const share of shares) {
		const entry = formatShare(share, userId, origin);

		if (entry) {
			formatted.push(entry);
		}
	}

	return formatted;
}
