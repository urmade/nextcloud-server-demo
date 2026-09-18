import { getAdminFilesHome, getDefaultDavUserId } from './store';
import type { DavFileNode } from './types';

export interface SystemTagRecord {
	id: number;
	name: string;
	visible: boolean;
	assignable: boolean;
	etag: string;
	color: string;
}

interface TreeExtrasStoreState {
	tags: Map<number, SystemTagRecord>;
	tagRelations: Map<string, Set<number>>;
	nextTagId: number;
}

const globalState = globalThis as typeof globalThis & {
	__ncDavTreeExtrasStore?: TreeExtrasStoreState;
};

function storeState(): TreeExtrasStoreState {
	if (!globalState.__ncDavTreeExtrasStore) {
		globalState.__ncDavTreeExtrasStore = seedStore();
	}

	return globalState.__ncDavTreeExtrasStore;
}

function seedStore(): TreeExtrasStoreState {
	const tags = new Map<number, SystemTagRecord>([
		[1, {
			id: 1,
			name: 'Important',
			visible: true,
			assignable: true,
			etag: '"tag-1"',
			color: '#ff0000',
		}],
		[2, {
			id: 2,
			name: 'Hidden',
			visible: false,
			assignable: false,
			etag: '"tag-2"',
			color: '#808080',
		}],
	]);

	const tagRelations = new Map<string, Set<number>>([
		['files:1001', new Set([1])],
	]);

	return {
		tags,
		tagRelations,
		nextTagId: 3,
	};
}

export function resetTreeExtrasStore(): void {
	globalState.__ncDavTreeExtrasStore = seedStore();
}

export const COMMENT_ENTITY_TYPES = new Set(['files']);

export function isCommentEntityType(type: string): boolean {
	return COMMENT_ENTITY_TYPES.has(type);
}

export function listSystemTags(userId: string, isAdmin: boolean): SystemTagRecord[] {
	const { tags } = storeState();

	return [...tags.values()].filter((tag) => isAdmin || tag.visible);
}

export function getSystemTagById(tagId: string, userId: string, isAdmin: boolean): SystemTagRecord | 'bad-request' | 'not-found' {
	if (!/^\d+$/.test(tagId)) {
		return 'bad-request';
	}

	const id = Number.parseInt(tagId, 10);
	const tag = storeState().tags.get(id);

	if (!tag) {
		return 'not-found';
	}

	if (!isAdmin && !tag.visible) {
		return 'not-found';
	}

	return tag;
}

export function listAssignedTags(userId: string, mediaType = ''): SystemTagRecord[] {
	const home = getAdminFilesHome();
	const assignedIds = new Set<number>();

	for (const [key, tagIds] of storeState().tagRelations.entries()) {
		if (!key.startsWith('files:')) {
			continue;
		}

		if (mediaType && mediaType !== 'files') {
			continue;
		}

		const fileId = Number.parseInt(key.slice('files:'.length), 10);
		const node = findNodeByFileId(home, fileId);

		if (!node) {
			continue;
		}

		for (const tagId of tagIds) {
			assignedIds.add(tagId);
		}
	}

	return [...assignedIds]
		.map((id) => storeState().tags.get(id))
		.filter((tag): tag is SystemTagRecord => Boolean(tag && tag.visible));
}

export function fileExistsInUserHome(userId: string, objectId: string): boolean {
	if (userId !== getDefaultDavUserId()) {
		return false;
	}

	if (!/^\d+$/.test(objectId)) {
		return false;
	}

	return findNodeByFileId(getAdminFilesHome(), Number.parseInt(objectId, 10)) !== null;
}

export function listTagsForObject(type: string, objectId: string, userId: string): SystemTagRecord[] | 'not-found' {
	if (type !== 'files' || !fileExistsInUserHome(userId, objectId)) {
		return 'not-found';
	}

	const key = `${type}:${objectId}`;
	const tagIds = storeState().tagRelations.get(key) ?? new Set<number>();

	return [...tagIds]
		.map((id) => storeState().tags.get(id))
		.filter((tag): tag is SystemTagRecord => Boolean(tag));
}

function findNodeByFileId(node: DavFileNode, fileId: number): DavFileNode | null {
	if (node.fileId === fileId) {
		return node;
	}

	for (const child of node.children ?? []) {
		const found = findNodeByFileId(child, fileId);

		if (found) {
			return found;
		}
	}

	return null;
}

export function userHasFilesFolder(userId: string): boolean {
	return userId === getDefaultDavUserId();
}
