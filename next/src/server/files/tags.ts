import { getAdminFilesHome } from '@/src/server/dav/store';
import type { DavFileNode } from '@/src/server/dav/types';

const fileTags = new Map<string, string[]>();

export class FileNotFoundError extends Error {}

export class StorageNotAvailableError extends Error {}

function storageKey(userId: string, fileId: number): string {
	return `${userId}:${fileId}`;
}

function normalizeRelativePath(path: string): string {
	return path.replace(/^\/+/, '');
}

function resolveFileNode(relativePath: string): DavFileNode | null {
	const segments = normalizeRelativePath(relativePath).split('/').filter(Boolean);

	if (segments.length === 0) {
		return null;
	}

	let current: DavFileNode = getAdminFilesHome();

	for (let index = 0; index < segments.length; index += 1) {
		const segment = segments[index];
		const child = current.children?.find((entry) => entry.name === segment);

		if (!child) {
			return null;
		}

		if (index === segments.length - 1) {
			return child;
		}

		if (child.kind !== 'directory') {
			return null;
		}

		current = child;
	}

	return null;
}

export function updateFileTags(userId: string, path: string, tags: string[]): string[] {
	const node = resolveFileNode(path);

	if (!node || node.kind !== 'file') {
		throw new FileNotFoundError(`/${normalizeRelativePath(path)}`);
	}

	fileTags.set(storageKey(userId, node.fileId), [...tags]);

	return tags;
}

export function getFileTags(userId: string, fileId: number): string[] {
	return fileTags.get(storageKey(userId, fileId)) ?? [];
}

export function resetFileTagsStore(): void {
	fileTags.clear();
}
