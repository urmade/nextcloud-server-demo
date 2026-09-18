import { PERMISSION_CREATE, PERMISSION_READ, PERMISSION_UPDATE } from '@/src/server/files_sharing/constants';
import { resolveUserNode } from '@/src/server/files_sharing/nodes';
import type { ShareRecord } from '@/src/server/files_sharing/types';
import { buildDavHref } from './remote';
import { sharePermissionsString } from './public-auth';
import { publicIngressBasePath, type ParsedPublicDavRequest } from './public-remote';
import type { DavFileNode } from './types';

export interface ResolvedPublicDavResource {
	node: DavFileNode;
	href: string;
	permissions: string;
}

function splitSegments(path: string): string[] {
	return path.split('/').filter(Boolean);
}

function findChild(node: DavFileNode, name: string): DavFileNode | null {
	return node.children?.find((child) => child.name === name) ?? null;
}

export function resolveShareRoot(share: ShareRecord): DavFileNode | null {
	const located = resolveUserNode(share.shareOwner, share.nodeId);

	return located?.node ?? null;
}

function resolveWithinNode(
	root: DavFileNode,
	relativeSegments: string[],
	requestPath: string,
	permissionMask: number,
): ResolvedPublicDavResource | 'not-found' {
	let current = root;
	let currentPath = requestPath;
	const permissions = sharePermissionsString(permissionMask);

	if (relativeSegments.length === 0) {
		return {
			node: current,
			href: buildDavHref(currentPath, current.kind === 'directory'),
			permissions,
		};
	}

	for (const segment of relativeSegments) {
		const child = findChild(current, segment);

		if (!child) {
			return 'not-found';
		}

		current = child;
		currentPath = `${currentPath.replace(/\/?$/, '')}/${segment}`;
	}

	return {
		node: current,
		href: buildDavHref(currentPath, current.kind === 'directory'),
		permissions,
	};
}

export function resolvePublicDavResource(
	parsed: ParsedPublicDavRequest,
	share: ShareRecord,
	token: string,
): ResolvedPublicDavResource | 'not-found' | 'unsupported' {
	const root = resolveShareRoot(share);

	if (!root) {
		return 'not-found';
	}

	const basePath = parsed.ingress === 'v2'
		? `${publicIngressBasePath('v2')}/files/${token}`
		: publicIngressBasePath('legacy-webdav');

	if (parsed.ingress === 'v2') {
		const segments = splitSegments(parsed.davPath);

		if (segments.length < 2 || segments[0] !== 'files') {
			return 'unsupported';
		}

		const relativeSegments = segments.slice(2);
		const requestPath = relativeSegments.length === 0
			? `${basePath}/`
			: `${basePath}/${relativeSegments.join('/')}`;

		return resolveWithinNode(root, relativeSegments, requestPath, share.permissions);
	}

	const relativeSegments = splitSegments(parsed.davPath);
	const requestPath = relativeSegments.length === 0
		? `${basePath}/`
		: `${basePath}/${relativeSegments.join('/')}`;

	return resolveWithinNode(root, relativeSegments, requestPath, share.permissions);
}

export function collectPublicPropfindResponses(
	resource: ResolvedPublicDavResource,
	depth: number,
): ResolvedPublicDavResource[] {
	const responses = [resource];

	if (depth < 1 || resource.node.kind !== 'directory') {
		return responses;
	}

	for (const child of resource.node.children ?? []) {
		const childPath = `${resource.href.replace(/\/?$/, '')}/${child.name}`;
		responses.push({
			node: child,
			href: buildDavHref(childPath, child.kind === 'directory'),
			permissions: resource.permissions,
		});
	}

	return responses;
}

let nextPublicFileId = 2000;

export function putFileInShare(
	share: ShareRecord,
	relativeSegments: string[],
	content: Buffer,
): 'created' | 'updated' | 'forbidden' | 'not-found' {
	if ((share.permissions & PERMISSION_CREATE) === 0 && (share.permissions & PERMISSION_UPDATE) === 0) {
		return 'forbidden';
	}

	const root = resolveShareRoot(share);

	if (!root) {
		return 'not-found';
	}

	const fileName = relativeSegments.at(-1);

	if (!fileName) {
		return 'not-found';
	}

	const parentSegments = relativeSegments.slice(0, -1);
	let current = root;

	for (const segment of parentSegments) {
		if (current.kind !== 'directory') {
			return 'not-found';
		}

		const child = findChild(current, segment);

		if (!child) {
			return 'not-found';
		}

		current = child;
	}

	if (current.kind !== 'directory') {
		return 'not-found';
	}

	if (!current.children) {
		current.children = [];
	}

	const existingIndex = current.children.findIndex((entry) => entry.name === fileName);
	const fileNode: DavFileNode = {
		name: fileName,
		kind: 'file',
		fileId: nextPublicFileId++,
		etag: `"public-${Date.now()}"`,
		size: content.length,
		contentType: 'application/octet-stream',
		mtime: Math.floor(Date.now() / 1000),
		content: content.toString('latin1'),
	};

	if (existingIndex >= 0) {
		current.children[existingIndex] = fileNode;

		return 'updated';
	}

	current.children.push(fileNode);

	return 'created';
}

export function canReadShare(share: ShareRecord): boolean {
	return (share.permissions & PERMISSION_READ) !== 0;
}
