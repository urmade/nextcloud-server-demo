import { buildDavHref, ingressBasePath } from './remote';
import { assembleFileIntoHome, getAdminFilesHome, getDefaultDavUserId } from './store';
import type { DavFileNode, ParsedDavRequest } from './types';
import { buildPropfindMultistatus } from './xml';

const OWN_HOME_PERMISSIONS = 'RGDNVCK';
const UPLOAD_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

interface UploadChunk {
	name: string;
	data: Buffer;
}

interface UploadFolderState {
	name: string;
	chunks: UploadChunk[];
	createdAt: number;
	touchedAt: number;
}

const uploadFolders = new Map<string, UploadFolderState>();
let nextUploadFileId = 2000;

function uploadKey(userId: string, folderName: string): string {
	return `${userId}/${folderName}`;
}

function splitSegments(path: string): string[] {
	return path.split('/').filter(Boolean);
}

export interface ParsedUploadRequest {
	userId: string;
	folderName?: string;
	chunkName?: string;
	requestPath: string;
}

export function parseUploadRequest(parsed: ParsedDavRequest): ParsedUploadRequest | null {
	const segments = splitSegments(parsed.davPath);

	if (segments.length < 2 || segments[0] !== 'uploads') {
		return null;
	}

	const userId = segments[1];
	const folderName = segments[2];
	const chunkName = segments[3];
	const basePath = `${ingressBasePath('v2')}/uploads/${userId}`;
	let requestPath = basePath;

	if (folderName) {
		requestPath = `${basePath}/${folderName}`;

		if (chunkName) {
			requestPath = `${requestPath}/${chunkName}`;
		}
	}

	return {
		userId,
		folderName,
		chunkName,
		requestPath,
	};
}

export function isUploadPath(parsed: ParsedDavRequest): boolean {
	return splitSegments(parsed.davPath)[0] === 'uploads';
}

export function assertUploadAccess(requestUserId: string, pathUserId: string): 'ok' | 'forbidden' {
	if (pathUserId !== requestUserId) {
		return 'forbidden';
	}

	return 'ok';
}

function touchUploadFolder(folder: UploadFolderState): void {
	folder.touchedAt = Date.now();
}

function purgeExpiredUploads(): void {
	const now = Date.now();

	for (const [key, folder] of uploadFolders.entries()) {
		if (now - folder.touchedAt > UPLOAD_SESSION_TTL_MS) {
			uploadFolders.delete(key);
		}
	}
}

function getUploadFolder(userId: string, folderName: string): UploadFolderState | null {
	purgeExpiredUploads();

	return uploadFolders.get(uploadKey(userId, folderName)) ?? null;
}

function uploadFolderNode(folder: UploadFolderState, requestPath: string): DavFileNode {
	return {
		name: folder.name,
		kind: 'directory',
		fileId: nextUploadFileId++,
		etag: `"upload-${folder.name}"`,
		size: 0,
		contentType: 'httpd/unix-directory',
	};
}

function uploadChunkNode(chunk: UploadChunk, requestPath: string): DavFileNode {
	return {
		name: chunk.name,
		kind: 'file',
		fileId: nextUploadFileId++,
		etag: `"chunk-${chunk.name}"`,
		size: chunk.data.length,
		contentType: 'application/octet-stream',
	};
}

export function createUploadFolder(userId: string, folderName: string): 'created' | 'conflict' {
	purgeExpiredUploads();

	const key = uploadKey(userId, folderName);

	if (uploadFolders.has(key)) {
		return 'conflict';
	}

	const now = Date.now();
	uploadFolders.set(key, {
		name: folderName,
		chunks: [],
		createdAt: now,
		touchedAt: now,
	});

	return 'created';
}

export function putUploadChunk(
	userId: string,
	folderName: string,
	chunkName: string,
	data: Buffer,
): 'created' | 'not-found' | 'invalid-chunk' {
	if (chunkName === '.file') {
		return 'invalid-chunk';
	}

	const folder = getUploadFolder(userId, folderName);

	if (!folder) {
		return 'not-found';
	}

	const existingIndex = folder.chunks.findIndex((chunk) => chunk.name === chunkName);

	if (existingIndex >= 0) {
		folder.chunks.splice(existingIndex, 1);
	}

	folder.chunks.push({ name: chunkName, data });
	touchUploadFolder(folder);

	return 'created';
}

function naturalCompare(a: string, b: string): number {
	return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function assembleChunks(folder: UploadFolderState): Buffer {
	const sorted = [...folder.chunks].sort((left, right) => naturalCompare(left.name, right.name));

	return Buffer.concat(sorted.map((chunk) => chunk.data));
}

export function parseDavDestinationHeader(destinationHeader: string | null, origin: string): string | null {
	if (!destinationHeader?.trim()) {
		return null;
	}

	try {
		const url = new URL(destinationHeader, origin);

		return url.pathname;
	} catch {
		return null;
	}
}

export function resolveFilesDestinationPath(pathname: string, userId: string): string | null {
	const prefix = `${ingressBasePath('v2')}/files/${userId}/`;

	if (!pathname.startsWith(prefix)) {
		return null;
	}

	return pathname.slice(prefix.length);
}

export function moveUploadFutureFile(
	userId: string,
	folderName: string,
	destinationPathname: string,
): 'created' | 'replaced' | 'not-found' | 'bad-destination' {
	const folder = getUploadFolder(userId, folderName);

	if (!folder) {
		return 'not-found';
	}

	const relativePath = resolveFilesDestinationPath(destinationPathname, userId);

	if (!relativePath || relativePath.endsWith('/')) {
		return 'bad-destination';
	}

	const content = assembleChunks(folder);
	const result = assembleFileIntoHome(relativePath, content);
	uploadFolders.delete(uploadKey(userId, folderName));

	return result.created ? 'created' : 'replaced';
}

export function collectUploadPropfindResponses(
	upload: ParsedUploadRequest,
	depth: number,
): Array<{ href: string; node: DavFileNode; permissions: string }> | 'not-found' {
	if (!upload.folderName) {
		const node: DavFileNode = {
			name: upload.userId,
			kind: 'directory',
			fileId: 0,
			etag: '"0000000000000000"',
			size: 0,
			contentType: 'httpd/unix-directory',
			children: [],
		};

		return [{
			href: buildDavHref(upload.requestPath, true),
			node,
			permissions: OWN_HOME_PERMISSIONS,
		}];
	}

	const folder = getUploadFolder(upload.userId, upload.folderName);

	if (!folder) {
		return 'not-found';
	}

	if (upload.chunkName) {
		if (upload.chunkName === '.file') {
			const assembledSize = folder.chunks.reduce((total, chunk) => total + chunk.data.length, 0);
			const node: DavFileNode = {
				name: '.file',
				kind: 'file',
				fileId: nextUploadFileId++,
				etag: folder.chunks.length > 0 ? `"future-${folder.name}"` : '"0000000000000000"',
				size: assembledSize,
				contentType: 'application/octet-stream',
			};

			return [{
				href: buildDavHref(upload.requestPath, false),
				node,
				permissions: OWN_HOME_PERMISSIONS,
			}];
		}

		const chunk = folder.chunks.find((entry) => entry.name === upload.chunkName);

		if (!chunk) {
			return 'not-found';
		}

		return [{
			href: buildDavHref(upload.requestPath, false),
			node: uploadChunkNode(chunk, upload.requestPath),
			permissions: OWN_HOME_PERMISSIONS,
		}];
	}

	const responses = [{
		href: buildDavHref(upload.requestPath, true),
		node: uploadFolderNode(folder, upload.requestPath),
		permissions: OWN_HOME_PERMISSIONS,
	}];

	if (depth < 1) {
		return responses;
	}

	const folderPath = upload.requestPath.replace(/\/?$/, '');
	responses.push({
		href: buildDavHref(`${folderPath}/.file`, false),
		node: {
			name: '.file',
			kind: 'file',
			fileId: nextUploadFileId++,
			etag: folder.chunks.length > 0 ? `"future-${folder.name}"` : '"0000000000000000"',
			size: folder.chunks.reduce((total, chunk) => total + chunk.data.length, 0),
			contentType: 'application/octet-stream',
		},
		permissions: OWN_HOME_PERMISSIONS,
	});

	for (const chunk of [...folder.chunks].sort((left, right) => naturalCompare(left.name, right.name))) {
		responses.push({
			href: buildDavHref(`${folderPath}/${chunk.name}`, false),
			node: uploadChunkNode(chunk, `${folderPath}/${chunk.name}`),
			permissions: OWN_HOME_PERMISSIONS,
		});
	}

	return responses;
}

export function buildUploadPropfindBody(
	upload: ParsedUploadRequest,
	depth: number,
): string {
	const responses = collectUploadPropfindResponses(upload, depth);

	if (responses === 'not-found') {
		throw new Error('upload folder missing');
	}

	return buildPropfindMultistatus(responses.map((entry) => ({
		href: entry.href,
		isCollection: entry.node.kind === 'directory',
		displayName: entry.node.name,
		etag: entry.node.etag,
		fileId: entry.node.fileId,
		size: entry.node.size,
		permissions: entry.permissions,
	})));
}

export function getDefaultUploadUserId(): string {
	return getDefaultDavUserId();
}

export function resetUploadStore(): void {
	uploadFolders.clear();
	nextUploadFileId = 2000;
}

export function verifyAssembledFileExists(relativePath: string): boolean {
	const segments = relativePath.split('/').filter(Boolean);
	let current = getAdminFilesHome();

	for (let index = 0; index < segments.length; index += 1) {
		const segment = segments[index];
		const child = current.children?.find((entry) => entry.name === segment);

		if (!child) {
			return false;
		}

		current = child;
	}

	return current.kind === 'file';
}
