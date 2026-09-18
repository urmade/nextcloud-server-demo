import { findParityGroup, isUserInGroup } from '@/src/server/config/groups';
import { findParityUser } from '@/src/server/config/users';
import { requireAuthenticatedUser } from '@/src/server/ocs/auth';
import {
	ocsFailureResponse,
	ocsSuccessResponse,
	parseOcsVersion,
} from '@/src/server/ocs/respond';
import {
	PERMISSION_SHARE,
	SHARE_TYPE_GROUP,
	SHARE_TYPE_LINK,
	SHARE_TYPE_USER,
} from './constants';
import { formatShare, formatShares } from './format';
import { findNodeByRelativePath } from './nodes';
import {
	acceptShareRecord,
	computeDefaultPermissions,
	computeLinkPermissions,
	createShareRecord,
	deleteShareFromSelf,
	deleteShareRecord,
	generateShareToken,
	getShareById,
	getSharesCreatedBy,
	getSharesSharedWith,
	listPendingSharesForUser,
	listShares,
	updateShareRecord,
} from './store';
import type { ShareCreateBody, ShareUpdateBody } from './types';

const MISSING_PATH = 'Please specify a file or folder path';
const WRONG_PATH = 'Wrong path, file/folder does not exist';
const UNKNOWN_SHARE_TYPE = 'Unknown share type';
const INVALID_USER = 'Please specify a valid account to share with';
const WRONG_SHARE_ID = 'Wrong share ID, share does not exist';
const CANNOT_EDIT = 'You are not allowed to edit incoming shares';
const CANNOT_DELETE = 'Could not delete share';
const CANNOT_SEND_MAIL = 'You are not allowed to send mail notifications';
const WRONG_PASSWORD = 'Wrong password';
const NO_UPDATE_PARAM = 'Wrong or no update parameter given';
const NO_MAIL_PROVIDER = 'No mail notification configured for this share type';
const FAILED_TOKEN = 'Failed to generate a unique token';
const INVALID_GROUP = 'Please specify a valid group';

function getOrigin(request: Request): string {
	const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '127.0.0.1:3100';
	const proto = request.headers.get('x-forwarded-proto') ?? 'http';

	return `${proto}://${host}`;
}

function requireShareUser(request: Request): string | Response {
	return requireAuthenticatedUser(request);
}

function parseJsonBody<T>(request: Request): Promise<T | null> {
	return request.json().catch(() => null) as Promise<T | null>;
}

function canAccessShare(share: ReturnType<typeof getShareById>, userId: string): boolean {
	if (!share || share.permissions === 0) {
		return false;
	}

	if (share.shareOwner === userId || share.sharedBy === userId) {
		return true;
	}

	if (share.shareType === SHARE_TYPE_USER && share.sharedWith === userId) {
		return true;
	}

	if (share.shareType === SHARE_TYPE_GROUP && share.sharedWith) {
		return isUserInGroup(userId, share.sharedWith);
	}

	return false;
}

function canEditShare(share: NonNullable<ReturnType<typeof getShareById>>, userId: string): boolean {
	return share.sharedBy === userId || share.shareOwner === userId;
}

function canDeleteShareFromSelf(share: NonNullable<ReturnType<typeof getShareById>>, userId: string): boolean {
	if (share.shareType !== SHARE_TYPE_GROUP || !share.sharedWith) {
		return false;
	}

	if (share.shareOwner === userId || share.sharedBy === userId) {
		return false;
	}

	return findParityGroup(share.sharedWith)?.members.includes(userId) ?? false;
}

export function handleGetShares(request: Request): Response {
	const ocsVersion = parseOcsVersion(request);
	const auth = requireShareUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const url = new URL(request.url);
	const sharedWithMe = url.searchParams.get('shared_with_me') === 'true';
	const reshares = url.searchParams.get('reshares') === 'true';
	const path = url.searchParams.get('path') ?? '';
	const origin = getOrigin(request);

	if (sharedWithMe) {
		const shared = getSharesSharedWith(auth).filter((share) => (
			share.shareOwner !== auth && share.sharedBy !== auth
		));

		return ocsSuccessResponse(formatShares(shared, auth, origin), ocsVersion);
	}

	if (path !== '') {
		const node = findNodeByRelativePath(path);

		if (!node) {
			return ocsFailureResponse(ocsVersion, 404, WRONG_PATH);
		}
	}

	let result = listShares().filter((share) => canAccessShare(share, auth));

	if (!reshares) {
		result = result.filter((share) => share.sharedBy === auth);
	}

	if (path !== '') {
		const node = findNodeByRelativePath(path);

		if (node) {
			result = result.filter((share) => share.nodeId === node.fileId);
		}
	}

	return ocsSuccessResponse(formatShares(result, auth, origin), ocsVersion);
}

export async function handleCreateShare(request: Request): Promise<Response> {
	const ocsVersion = parseOcsVersion(request);
	const auth = requireShareUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const body = await parseJsonBody<ShareCreateBody>(request);
	const path = body?.path ?? null;

	if (path === null || path === undefined) {
		return ocsFailureResponse(ocsVersion, 404, MISSING_PATH);
	}

	const node = findNodeByRelativePath(path);

	if (!node) {
		return ocsFailureResponse(ocsVersion, 404, WRONG_PATH);
	}

	const shareType = body?.shareType ?? -1;

	if (shareType === -1) {
		return ocsFailureResponse(ocsVersion, 400, UNKNOWN_SHARE_TYPE);
	}

	const origin = getOrigin(request);
	const normalizedPath = path.startsWith('/') ? path : `/${path}`;
	const target = normalizedPath;

	if (shareType === SHARE_TYPE_USER) {
		const shareWith = body?.shareWith;

		if (!shareWith || !findParityUser(shareWith)) {
			return ocsFailureResponse(ocsVersion, 404, INVALID_USER);
		}

		const permissions = body?.permissions ?? computeDefaultPermissions(shareType, node.kind);
		const share = createShareRecord({
			shareType,
			sharedBy: auth,
			shareOwner: auth,
			sharedWith: shareWith,
			permissions,
			nodeId: node.fileId,
			path: normalizedPath,
			target,
			note: body?.note ?? '',
			mailSend: body?.sendMail === 'true',
		});

		const formatted = formatShare(share, auth, origin);

		return ocsSuccessResponse(formatted, ocsVersion);
	}

	if (shareType === SHARE_TYPE_GROUP) {
		const shareWith = body?.shareWith;

		if (!shareWith || !findParityGroup(shareWith)) {
			return ocsFailureResponse(ocsVersion, 404, INVALID_GROUP);
		}

		const permissions = body?.permissions ?? computeDefaultPermissions(shareType, node.kind);
		const share = createShareRecord({
			shareType,
			sharedBy: auth,
			shareOwner: auth,
			sharedWith: shareWith,
			permissions,
			nodeId: node.fileId,
			path: normalizedPath,
			target,
			note: body?.note ?? '',
			mailSend: body?.sendMail === 'true',
		});

		const formatted = formatShare(share, auth, origin);

		return ocsSuccessResponse(formatted, ocsVersion);
	}

	if (shareType === SHARE_TYPE_LINK) {
		const hasPublicUpload = body?.publicUpload === 'true';
		const permissions = computeLinkPermissions(body?.permissions, hasPublicUpload);
		const share = createShareRecord({
			shareType,
			sharedBy: auth,
			shareOwner: auth,
			sharedWith: null,
			permissions,
			nodeId: node.fileId,
			path: normalizedPath,
			target,
			password: body?.password ?? null,
			label: body?.label ?? '',
			note: body?.note ?? '',
			sendPasswordByTalk: body?.sendPasswordByTalk === 'true',
			mailSend: body?.sendMail === 'true',
			hideDownload: body?.hideDownload === 'true',
		});

		const formatted = formatShare(share, auth, origin);

		return ocsSuccessResponse(formatted, ocsVersion);
	}

	return ocsFailureResponse(ocsVersion, 400, UNKNOWN_SHARE_TYPE);
}

export function handleGetShare(request: Request, id: string): Response {
	const ocsVersion = parseOcsVersion(request);
	const auth = requireShareUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const shareId = Number.parseInt(id, 10);
	const share = getShareById(shareId);
	const origin = getOrigin(request);

	if (!share || !canAccessShare(share, auth)) {
		return ocsFailureResponse(ocsVersion, 404, WRONG_SHARE_ID);
	}

	const formatted = formatShare(share, auth, origin);

	if (!formatted) {
		return ocsFailureResponse(ocsVersion, 404, WRONG_SHARE_ID);
	}

	return ocsSuccessResponse([formatted], ocsVersion);
}

export function handleDeleteShare(request: Request, id: string): Response {
	const ocsVersion = parseOcsVersion(request);
	const auth = requireShareUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const shareId = Number.parseInt(id, 10);
	const share = getShareById(shareId);

	if (!share || !canAccessShare(share, auth)) {
		return ocsFailureResponse(ocsVersion, 404, WRONG_SHARE_ID);
	}

	if (canDeleteShareFromSelf(share, auth)) {
		deleteShareFromSelf(shareId, auth);

		return ocsSuccessResponse([], ocsVersion);
	}

	if (!canEditShare(share, auth)) {
		return ocsFailureResponse(ocsVersion, 403, CANNOT_DELETE);
	}

	deleteShareRecord(shareId);

	return ocsSuccessResponse([], ocsVersion);
}

export async function handleUpdateShare(request: Request, id: string): Promise<Response> {
	const ocsVersion = parseOcsVersion(request);
	const auth = requireShareUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const shareId = Number.parseInt(id, 10);
	const share = getShareById(shareId);
	const origin = getOrigin(request);

	if (!share || !canAccessShare(share, auth)) {
		return ocsFailureResponse(ocsVersion, 404, WRONG_SHARE_ID);
	}

	if (!canEditShare(share, auth)) {
		return ocsFailureResponse(ocsVersion, 403, CANNOT_EDIT);
	}

	const body = await parseJsonBody<ShareUpdateBody>(request);

	if (!body || Object.keys(body).length === 0) {
		return ocsFailureResponse(ocsVersion, 400, NO_UPDATE_PARAM);
	}

	const patch: Partial<typeof share> = {};

	if (body.note !== undefined) {
		patch.note = body.note;
	}

	if (body.label !== undefined) {
		patch.label = body.label;
	}

	if (body.permissions !== undefined) {
		patch.permissions = body.permissions;
	}

	if (body.password !== undefined) {
		patch.password = body.password === '' ? null : body.password;
	}

	if (body.hideDownload === 'true') {
		patch.hideDownload = true;
	} else if (body.hideDownload === 'false') {
		patch.hideDownload = false;
	}

	if (body.sendPasswordByTalk === 'true') {
		patch.sendPasswordByTalk = true;
	} else if (body.sendPasswordByTalk !== undefined) {
		patch.sendPasswordByTalk = false;
	}

	if (body.token !== undefined && share.shareType === SHARE_TYPE_LINK) {
		patch.token = body.token;
	}

	const updated = updateShareRecord(shareId, patch);

	if (!updated) {
		return ocsFailureResponse(ocsVersion, 404, WRONG_SHARE_ID);
	}

	const formatted = formatShare(updated, auth, origin);

	return ocsSuccessResponse(formatted, ocsVersion);
}

export function handleGetInheritedShares(request: Request): Response {
	const ocsVersion = parseOcsVersion(request);
	const auth = requireShareUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const url = new URL(request.url);
	const path = url.searchParams.get('path') ?? '';

	if (!path) {
		return ocsFailureResponse(ocsVersion, 404, WRONG_PATH);
	}

	const node = findNodeByRelativePath(path);

	if (!node) {
		return ocsFailureResponse(ocsVersion, 404, WRONG_PATH);
	}

	const itemPermissions = 27;

	if ((itemPermissions & PERMISSION_SHARE) === 0) {
		return new Response('no sharing rights on this item', {
			status: 500,
			headers: {
				'content-type': 'text/plain; charset=UTF-8',
			},
		});
	}

	const origin = getOrigin(request);
	const inherited = getSharesCreatedBy(auth).filter((share) => share.nodeId !== node.fileId);

	return ocsSuccessResponse(formatShares(inherited, auth, origin), ocsVersion);
}

export function handlePendingShares(request: Request): Response {
	const ocsVersion = parseOcsVersion(request);
	const auth = requireShareUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const origin = getOrigin(request);
	const pending = listPendingSharesForUser(auth);
	const formatted = pending.map((share) => {
		const entry = formatShare(share, auth, origin, {
			path: `/${findNodeByRelativePath(share.path)?.name ?? share.path.replace(/^\/+/, '')}`,
			permissions: 0,
		});

		return entry;
	}).filter((entry): entry is NonNullable<typeof entry> => entry !== null);

	return ocsSuccessResponse(formatted, ocsVersion);
}

export function handleAcceptShare(request: Request, id: string): Response {
	const ocsVersion = parseOcsVersion(request);
	const auth = requireShareUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const shareId = Number.parseInt(id, 10);
	const share = getShareById(shareId);

	if (!share || !canAccessShare(share, auth)) {
		return ocsFailureResponse(ocsVersion, 404, WRONG_SHARE_ID);
	}

	if (!acceptShareRecord(shareId, auth)) {
		return ocsFailureResponse(ocsVersion, 400, 'Failed to accept share.');
	}

	return ocsSuccessResponse([], ocsVersion);
}

export async function handleSendShareEmail(request: Request, id: string): Promise<Response> {
	const ocsVersion = parseOcsVersion(request);
	const auth = requireShareUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const shareId = Number.parseInt(id, 10);
	const share = getShareById(shareId);

	if (!share || !canAccessShare(share, auth)) {
		return ocsFailureResponse(ocsVersion, 404, WRONG_SHARE_ID);
	}

	if (!canEditShare(share, auth)) {
		return ocsFailureResponse(ocsVersion, 403, CANNOT_SEND_MAIL);
	}

	if (share.shareType === SHARE_TYPE_LINK && share.sharedBy !== auth) {
		return ocsFailureResponse(ocsVersion, 403, CANNOT_SEND_MAIL);
	}

	const body = await parseJsonBody<{ password?: string }>(request);

	if (share.password && share.password !== (body?.password ?? '')) {
		return ocsFailureResponse(ocsVersion, 400, WRONG_PASSWORD);
	}

	if (share.shareType !== SHARE_TYPE_LINK) {
		return ocsFailureResponse(ocsVersion, 400, NO_MAIL_PROVIDER);
	}

	return ocsSuccessResponse([], ocsVersion);
}

export function handleGenerateToken(request: Request): Response {
	const ocsVersion = parseOcsVersion(request);
	const auth = requireShareUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	try {
		return ocsSuccessResponse({ token: generateShareToken() }, ocsVersion);
	} catch {
		return ocsFailureResponse(ocsVersion, 996, FAILED_TOKEN);
	}
}
