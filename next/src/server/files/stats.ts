import { getAdminFilesHome } from '@/src/server/dav/store';
import { findParityUser } from '@/src/server/config/users';
import type { DavFileNode } from '@/src/server/dav/types';
import type { FilesStorageStats } from './types';

export const SPACE_UNLIMITED = -3;
export const SPACE_NOT_COMPUTED = -1;

function sumFileSizes(node: DavFileNode): number {
	if (node.kind === 'file') {
		return node.size;
	}

	return (node.children ?? []).reduce((total, child) => total + sumFileSizes(child), 0);
}

export function computeStorageStats(userId: string, dir = '/'): FilesStorageStats {
	const home = getAdminFilesHome();
	const normalizedDir = dir.replace(/^\/+|\/+$/g, '');
	let target: DavFileNode = home;

	if (normalizedDir) {
		const segments = normalizedDir.split('/').filter(Boolean);
		let current = home;

		for (const segment of segments) {
			const child = current.children?.find((entry) => entry.name === segment);

			if (!child || child.kind !== 'directory') {
				break;
			}

			current = child;
		}

		target = current;
	}

	const used = sumFileSizes(target);
	const quota = SPACE_UNLIMITED;
	const free = SPACE_NOT_COMPUTED;
	const total = free;
	const relative = 0;
	const owner = userId;
	const ownerDisplayName = findParityUser(userId)?.displayName ?? userId;

	return {
		free,
		used,
		quota,
		total,
		relative,
		owner,
		ownerDisplayName,
		mountType: '',
		mountPoint: '',
	};
}
