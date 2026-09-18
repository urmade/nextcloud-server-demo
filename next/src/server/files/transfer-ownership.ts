import { getAdminFilesHome, getDefaultDavUserId } from '@/src/server/dav/store';
import type { DavFileNode } from '@/src/server/dav/types';
import { findParityUser } from '@/src/server/config/users';
import {
	deleteTransferOwnership,
	getTransferOwnershipById,
	insertTransferOwnership,
	queueTransferOwnershipJob,
} from './transfer-ownership-store';
import { requireTemplatesOcsUser } from './templates-auth';
import {
	ocsFailureResponse,
	ocsSuccessResponse,
	parseOcsVersion,
} from '@/src/server/ocs/respond';

function findNodeByPath(pathValue: string): DavFileNode | null {
	const segments = pathValue.replace(/^\/+/, '').split('/').filter(Boolean);

	if (segments.length === 0) {
		return null;
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

function isHomeStorageNode(userId: string, node: DavFileNode): boolean {
	return userId === getDefaultDavUserId();
}

export async function handleTransferOwnershipTransfer(request: Request): Promise<Response> {
	const ocsVersion = parseOcsVersion(request);
	const body = await request.json().catch(() => null) as {
		recipient?: string;
		path?: string;
	} | null;
	const auth = requireTemplatesOcsUser(request, body ?? undefined);

	if (auth instanceof Response) {
		return auth;
	}

	if (!body?.recipient || !body.path) {
		return new Response(null, { status: 400 });
	}

	if (!findParityUser(body.recipient)) {
		return ocsFailureResponse(ocsVersion, 400, '', []);
	}

	const node = findNodeByPath(body.path);

	if (!node) {
		return ocsFailureResponse(ocsVersion, 400, '', []);
	}

	if (auth !== getDefaultDavUserId() || !isHomeStorageNode(auth, node)) {
		return ocsFailureResponse(ocsVersion, 403, '', []);
	}

	insertTransferOwnership({
		sourceUser: auth,
		targetUser: body.recipient,
		fileId: node.fileId,
		nodeName: node.name,
	});

	return ocsSuccessResponse([], ocsVersion);
}

export async function handleTransferOwnershipAccept(request: Request, id: number): Promise<Response> {
	const ocsVersion = parseOcsVersion(request);
	const auth = requireTemplatesOcsUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const row = getTransferOwnershipById(id);

	if (!row) {
		return ocsFailureResponse(ocsVersion, 404, '', []);
	}

	if (row.targetUser !== auth) {
		return ocsFailureResponse(ocsVersion, 403, '', []);
	}

	queueTransferOwnershipJob(id);

	return ocsSuccessResponse([], ocsVersion);
}

export async function handleTransferOwnershipReject(request: Request, id: number): Promise<Response> {
	const ocsVersion = parseOcsVersion(request);
	const auth = requireTemplatesOcsUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const row = getTransferOwnershipById(id);

	if (!row) {
		return ocsFailureResponse(ocsVersion, 404, '', []);
	}

	if (row.targetUser !== auth) {
		return ocsFailureResponse(ocsVersion, 403, '', []);
	}

	deleteTransferOwnership(id);

	return ocsSuccessResponse([], ocsVersion);
}
