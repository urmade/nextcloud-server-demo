import { parseCookieHeader, SESSION_COOKIE } from '@/src/server/auth/cookies';
import { isCsrfTokenValid } from '@/src/server/auth/csrf';
import { getSession } from '@/src/server/auth/session-store';
import { getAdminFilesHome } from '@/src/server/dav/store';
import type { DavFileNode } from '@/src/server/dav/types';
import { requireFilesApiUser } from './api';

const JSON_HEADERS = {
	'content-type': 'application/json; charset=utf-8',
};

export interface FolderTreeNode {
	id: number;
	basename: string;
	children: FolderTreeNode[];
	displayName?: string;
}

function csrfFailure(): Response {
	return new Response(JSON.stringify({ message: 'CSRF check failed' }), {
		status: 412,
		headers: JSON_HEADERS,
	});
}

function jsonMessage(message: string, status: number): Response {
	return new Response(JSON.stringify({ message }), {
		status,
		headers: JSON_HEADERS,
	});
}

function extractRequestToken(request: Request): string | null {
	const url = new URL(request.url);
	const queryToken = url.searchParams.get('requesttoken');

	if (queryToken) {
		return queryToken;
	}

	return request.headers.get('requesttoken');
}

function enforceFolderTreeCsrf(request: Request): Response | null {
	const cookies = parseCookieHeader(request.headers.get('cookie'));
	const session = getSession(cookies[SESSION_COOKIE]);
	const token = extractRequestToken(request);

	if (!isCsrfTokenValid(session?.csrfToken, token ?? '')) {
		return csrfFailure();
	}

	return null;
}

function findDirectoryByPath(relativePath: string): DavFileNode | 'missing' | 'not-folder' {
	const normalized = relativePath.replace(/^\/+/, '').replace(/\/+$/, '');

	if (!normalized) {
		return getAdminFilesHome();
	}

	const segments = normalized.split('/').filter(Boolean);
	let current = getAdminFilesHome();

	for (const segment of segments) {
		if (current.kind !== 'directory') {
			return 'missing';
		}

		const child = current.children?.find((entry) => entry.name === segment);

		if (!child) {
			return 'missing';
		}

		current = child;
	}

	if (current.kind !== 'directory') {
		return 'not-folder';
	}

	return current;
}

function listDirectories(node: DavFileNode): DavFileNode[] {
	return (node.children ?? []).filter((child) => child.kind === 'directory');
}

function getChildren(nodes: DavFileNode[], depth: number, currentDepth = 0): FolderTreeNode[] {
	if (depth <= 0 || currentDepth >= depth) {
		return [];
	}

	return nodes.map((node) => {
		const basename = node.name;
		const entry: FolderTreeNode = {
			id: node.fileId,
			basename,
			children: getChildren(listDirectories(node), depth, currentDepth + 1),
		};

		return entry;
	});
}

function getParents(currentFolder: DavFileNode, root: DavFileNode, children: FolderTreeNode[]): FolderTreeNode[] {
	const parent = findParentNode(root, currentFolder.fileId);

	if (!parent) {
		return children;
	}

	const siblings = listDirectories(parent);
	const parentData = siblings.map((node) => ({
		id: node.fileId,
		basename: node.name,
		displayName: node.name,
		children: node.fileId === currentFolder.fileId ? children : [],
	}));

	if (parent.fileId === root.fileId) {
		return parentData;
	}

	return getParents(parent, root, parentData);
}

function findParentNode(root: DavFileNode, fileId: number): DavFileNode | null {
	for (const child of root.children ?? []) {
		if (child.fileId === fileId) {
			return root;
		}

		if (child.kind === 'directory') {
			const found = findParentNode(child, fileId);

			if (found) {
				return found;
			}
		}
	}

	return null;
}

function parseBooleanParam(value: string | null, defaultValue: boolean): boolean {
	if (value === null) {
		return defaultValue;
	}

	return value === 'true' || value === '1';
}

export function handleGetFolderTree(request: Request): Response {
	const auth = requireFilesApiUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const csrf = enforceFolderTreeCsrf(request);

	if (csrf) {
		return csrf;
	}

	const url = new URL(request.url);
	const folderPath = url.searchParams.get('path') ?? '/';
	const depth = Number.parseInt(url.searchParams.get('depth') ?? '1', 10);
	const withParents = parseBooleanParam(url.searchParams.get('withParents'), false);

	try {
		const located = findDirectoryByPath(folderPath);

		if (located === 'missing') {
			return jsonMessage('Folder not found', 404);
		}

		if (located === 'not-folder') {
			return jsonMessage('Invalid folder path', 400);
		}

		const directories = listDirectories(located);
		let tree = getChildren(directories, Number.isNaN(depth) ? 1 : depth);

		if (withParents && folderPath !== '/') {
			tree = getParents(located, getAdminFilesHome(), tree);
		}

		return new Response(JSON.stringify(tree), {
			status: 200,
			headers: JSON_HEADERS,
		});
	} catch {
		return new Response(JSON.stringify([]), {
			status: 200,
			headers: JSON_HEADERS,
		});
	}
}
