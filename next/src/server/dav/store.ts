import type { DavFileNode } from './types';

const ADMIN_USER = process.env.NC_ADMIN_USER?.trim() || 'admin';
let nextFileId = 1100;
let filesHome = adminHome();

function welcomeFile(): DavFileNode {
	return {
		name: 'welcome.txt',
		kind: 'file',
		fileId: 1001,
		etag: '"64f0a1b2c3d4e5f6"',
		size: 13,
		contentType: 'text/plain',
		content: 'Hello, admin!',
	};
}

function documentsFolder(): DavFileNode {
	return {
		name: 'Documents',
		kind: 'directory',
		fileId: 1002,
		etag: '"64f0a1b2c3d4e5f7"',
		size: 0,
		contentType: 'httpd/unix-directory',
		children: [
			{
				name: 'readme.md',
				kind: 'file',
				fileId: 1003,
				etag: '"64f0a1b2c3d4e5f8"',
				size: 28,
				contentType: 'text/markdown',
				content: '# Documents\n\nParity seed file.',
			},
		],
	};
}

function adminHome(): DavFileNode {
	return {
		name: ADMIN_USER,
		kind: 'directory',
		fileId: 1000,
		etag: '"64f0a1b2c3d4e5f5"',
		size: 0,
		contentType: 'httpd/unix-directory',
		children: [welcomeFile(), documentsFolder()],
	};
}

export function getDefaultDavUserId(): string {
	return ADMIN_USER;
}

export function getAdminFilesHome(): DavFileNode {
	return filesHome;
}

function findOrCreateDirectory(segments: string[]): DavFileNode {
	let current = filesHome;

	for (const segment of segments) {
		if (current.kind !== 'directory') {
			throw new Error('Cannot create directory inside a file');
		}

		if (!current.children) {
			current.children = [];
		}

		let child = current.children.find((entry) => entry.name === segment);

		if (!child) {
			child = {
				name: segment,
				kind: 'directory',
				fileId: nextFileId++,
				etag: `"dir-${nextFileId}"`,
				size: 0,
				contentType: 'httpd/unix-directory',
				children: [],
			};
			current.children.push(child);
		}

		current = child;
	}

	return current;
}

export function assembleFileIntoHome(relativePath: string, content: Buffer): { created: boolean } {
	const segments = relativePath.split('/').filter(Boolean);
	const fileName = segments.pop();

	if (!fileName) {
		throw new Error('Missing destination file name');
	}

	const parent = segments.length === 0 ? filesHome : findOrCreateDirectory(segments);

	if (!parent.children) {
		parent.children = [];
	}

	const existingIndex = parent.children.findIndex((entry) => entry.name === fileName);
	const etag = `"assembled-${Date.now()}"`;
	const fileNode: DavFileNode = {
		name: fileName,
		kind: 'file',
		fileId: nextFileId++,
		etag,
		size: content.length,
		contentType: 'application/octet-stream',
		content: content.toString('latin1'),
	};

	if (existingIndex >= 0) {
		parent.children[existingIndex] = fileNode;

		return { created: false };
	}

	parent.children.push(fileNode);

	return { created: true };
}

export function resetDavFileStore(): void {
	nextFileId = 1100;
	filesHome = adminHome();
}

export function getEmptyPrincipalCollection(name: string): DavFileNode {
	return {
		name,
		kind: 'directory',
		fileId: 0,
		etag: '"0000000000000000"',
		size: 0,
		contentType: 'httpd/unix-directory',
		children: [],
	};
}
