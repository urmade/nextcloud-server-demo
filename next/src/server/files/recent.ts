import { getAdminFilesHome, getDefaultDavUserId } from '@/src/server/dav/store';
import type { DavFileNode } from '@/src/server/dav/types';

const TWO_WEEKS_SECONDS = 14 * 24 * 60 * 60;
const RECENT_LIMIT = 100;
const PERMISSION_ALL = 31;

export interface RecentFileEntry {
	id: number;
	parentId: number;
	mtime: number;
	name: string;
	permissions: number;
	mimetype: string;
	size: number;
	type: 'file' | 'dir';
	etag: string;
	hasPreview: boolean;
	path: string;
	shareTypes?: number[];
}

interface RecentEntryContext {
	node: DavFileNode;
	parentId: number;
	relativePath: string;
}

function hasFilePreview(node: DavFileNode): boolean {
	if (node.kind === 'directory') {
		return false;
	}

	return node.contentType.startsWith('text/') || node.contentType.startsWith('image/');
}

function formatDavPath(relativePath: string): string {
	const slashIndex = relativePath.lastIndexOf('/');

	if (slashIndex < 0) {
		return '/';
	}

	return `/${relativePath.slice(0, slashIndex)}`;
}

function formatRecentEntry(context: RecentEntryContext): RecentFileEntry {
	const { node, parentId, relativePath } = context;

	return {
		id: node.fileId,
		parentId,
		mtime: (node.mtime ?? 0) * 1000,
		name: node.name,
		permissions: PERMISSION_ALL,
		mimetype: node.contentType,
		size: node.size,
		type: node.kind === 'directory' ? 'dir' : 'file',
		etag: node.etag,
		hasPreview: hasFilePreview(node),
		path: formatDavPath(relativePath),
	};
}

function isRecentCandidate(node: DavFileNode, cutoff: number): boolean {
	const mtime = node.mtime ?? 0;

	if (mtime <= cutoff) {
		return false;
	}

	if (node.kind === 'file') {
		return true;
	}

	return (node.children?.length ?? 0) === 0;
}

function collectRecentEntries(home: DavFileNode, cutoff: number): RecentEntryContext[] {
	const results: RecentEntryContext[] = [];

	function walk(node: DavFileNode, parentId: number, relativePath: string): void {
		if (isRecentCandidate(node, cutoff)) {
			results.push({ node, parentId, relativePath });
		}

		if (node.kind !== 'directory') {
			return;
		}

		for (const child of node.children ?? []) {
			const childPath = relativePath ? `${relativePath}/${child.name}` : child.name;
			walk(child, node.fileId, childPath);
		}
	}

	for (const child of home.children ?? []) {
		walk(child, home.fileId, child.name);
	}

	return results
		.sort((left, right) => (right.node.mtime ?? 0) - (left.node.mtime ?? 0))
		.slice(0, RECENT_LIMIT);
}

export function getRecentFiles(userId: string): RecentFileEntry[] {
	if (userId !== getDefaultDavUserId()) {
		return [];
	}

	const cutoff = Math.floor(Date.now() / 1000) - TWO_WEEKS_SECONDS;
	const entries = collectRecentEntries(getAdminFilesHome(), cutoff);

	return entries.map(formatRecentEntry);
}
