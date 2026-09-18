import { isOutgoingServer2ServerShareEnabled } from './config';
import { PERMISSION_ALL, PERMISSION_READ } from './constants';
import { getNodeParentId, resolveUserNode } from './nodes';
import { getShareByToken } from './store';
import type { ShareRecord } from './types';
import type { DavFileNode } from '@/src/server/dav/types';

const JSON_HEADERS = {
	'content-type': 'application/json; charset=utf-8',
};

export interface ShareInfoNode {
	id: number;
	parentId: number;
	mtime: number;
	name: string;
	permissions: number;
	mimetype: string;
	size: number;
	type: string;
	etag: string;
	children?: ShareInfoNode[];
}

interface ShareInfoBody {
	t?: string;
	password?: string | null;
	dir?: string | null;
	depth?: number;
}

function wrapShareInfoResponse(status: number, data: unknown): Response {
	const wrappedStatus = status === 200 ? 'success' : 'error';

	return new Response(JSON.stringify({ data, status: wrappedStatus }), {
		status,
		headers: JSON_HEADERS,
	});
}

function rawBadRequest(): Response {
	return new Response(null, { status: 400 });
}

async function parseShareInfoBody(request: Request): Promise<ShareInfoBody | 'invalid'> {
	let bodyText = '';

	try {
		bodyText = await request.text();
	} catch {
		bodyText = '';
	}

	if (bodyText.trim() === '') {
		return {};
	}

	const contentType = request.headers.get('content-type') ?? '';

	if (contentType.includes('application/json')) {
		try {
			return JSON.parse(bodyText) as ShareInfoBody;
		} catch {
			return 'invalid';
		}
	}

	const params = new URLSearchParams(bodyText);
	const depthRaw = params.get('depth');
	const depth = depthRaw === null || depthRaw === ''
		? undefined
		: Number.parseInt(depthRaw, 10);

	return {
		t: params.get('t') ?? undefined,
		password: params.get('password'),
		dir: params.get('dir'),
		depth: depth !== undefined && Number.isNaN(depth) ? undefined : depth,
	};
}

function isPasswordProtected(share: ShareRecord): boolean {
	return share.password !== null && share.password !== '';
}

function checkSharePassword(share: ShareRecord, password: string | null | undefined): boolean {
	if (!isPasswordProtected(share)) {
		return true;
	}

	return share.password === (password ?? '');
}

function resolveShareNode(share: ShareRecord, dir: string | null | undefined): DavFileNode | null {
	const located = resolveUserNode(share.shareOwner, share.nodeId);

	if (!located) {
		return null;
	}

	let node = located.node;

	if (dir !== null && dir !== undefined && dir !== '' && node.kind === 'directory') {
		const segments = dir.replace(/^\/+/, '').split('/').filter(Boolean);
		let current = node;

		for (const segment of segments) {
			if (current.kind !== 'directory') {
				return located.node;
			}

			const child = current.children?.find((entry) => entry.name === segment);

			if (!child) {
				return located.node;
			}

			current = child;
		}

		node = current;
	}

	return node;
}

function formatShareInfoNode(
	node: DavFileNode,
	permissionMask: number,
	depth: number,
): ShareInfoNode {
	const entry: ShareInfoNode = {
		id: node.fileId,
		parentId: getNodeParentId(node),
		mtime: node.mtime ?? 0,
		name: node.name,
		permissions: PERMISSION_ALL & permissionMask,
		mimetype: node.contentType,
		size: node.size,
		type: node.kind === 'directory' ? 'folder' : 'file',
		etag: node.etag,
	};

	if (node.kind !== 'directory' || depth === 0) {
		return entry;
	}

	entry.children = (node.children ?? []).map((child) => formatShareInfoNode(
		child,
		permissionMask,
		depth <= -1 ? -1 : depth - 1,
	));

	return entry;
}

export async function handleShareInfo(request: Request): Promise<Response> {
	if (!isOutgoingServer2ServerShareEnabled()) {
		return wrapShareInfoResponse(404, []);
	}

	const body = await parseShareInfoBody(request);

	if (body === 'invalid' || body.t === undefined) {
		return rawBadRequest();
	}

	const share = getShareByToken(body.t);

	if (!share) {
		return wrapShareInfoResponse(404, []);
	}

	if (!checkSharePassword(share, body.password)) {
		return wrapShareInfoResponse(403, []);
	}

	if ((share.permissions & PERMISSION_READ) === 0) {
		return wrapShareInfoResponse(403, []);
	}

	const node = resolveShareNode(share, body.dir);

	if (!node) {
		return wrapShareInfoResponse(404, []);
	}

	const depth = body.depth ?? -1;
	const data = formatShareInfoNode(node, share.permissions, depth);

	return wrapShareInfoResponse(200, data);
}
