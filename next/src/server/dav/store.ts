import type { DavFileNode } from './types';

const ADMIN_USER = process.env.NC_ADMIN_USER?.trim() || 'admin';

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
	return adminHome();
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
