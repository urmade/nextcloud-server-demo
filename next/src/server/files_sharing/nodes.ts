import { getAdminFilesHome, getDefaultDavUserId } from '@/src/server/dav/store';
import type { DavFileNode } from '@/src/server/dav/types';

export function findNodeByRelativePath(relativePath: string): DavFileNode | null {
	const normalized = relativePath.replace(/^\/+/, '');
	const segments = normalized.split('/').filter(Boolean);

	if (segments.length === 0) {
		return getAdminFilesHome();
	}

	let current = getAdminFilesHome();

	for (const segment of segments) {
		if (current.kind !== 'directory') {
			return null;
		}

		const child = current.children?.find((entry) => entry.name === segment);

		if (!child) {
			return null;
		}

		current = child;
	}

	return current;
}

export function getNodeParentId(node: DavFileNode): number {
	function walk(parent: DavFileNode, target: DavFileNode): number | null {
		for (const child of parent.children ?? []) {
			if (child === target) {
				return parent.fileId;
			}

			if (child.kind === 'directory') {
				const found = walk(child, target);

				if (found !== null) {
					return found;
				}
			}
		}

		return null;
	}

	return walk(getAdminFilesHome(), node) ?? getAdminFilesHome().fileId;
}

export function nodeHasPreview(node: DavFileNode): boolean {
	return node.kind === 'file' && (node.contentType?.startsWith('image/') ?? false);
}

export function resolveUserNode(userId: string, nodeId: number): { node: DavFileNode; path: string } | null {
	if (userId !== getDefaultDavUserId()) {
		return null;
	}

	function walk(node: DavFileNode, segments: string[]): { node: DavFileNode; path: string } | null {
		if (node.fileId === nodeId) {
			return {
				node,
				path: segments.length === 0 ? '/' : `/${segments.join('/')}`,
			};
		}

		for (const child of node.children ?? []) {
			const found = walk(child, [...segments, child.name]);

			if (found) {
				return found;
			}
		}

		return null;
	}

	return walk(getAdminFilesHome(), []);
}
