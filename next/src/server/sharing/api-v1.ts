import { resolveAuthenticatedUserId } from '@/src/server/ocs/auth';
import {
	buildOcsFailureEnvelope,
	getOcsHttpStatus,
	type OcsApiVersion,
} from '@/src/server/ocs/envelope';
import {
	ocsBadRequestStringResponse,
	ocsCreatedResponse,
	ocsFailureResponse,
	ocsSuccessResponse,
	ocsUnauthorizedResponse,
	parseOcsVersion,
} from '@/src/server/ocs/respond';
import { isSharingV1ApiEnabled } from '@/src/server/sharing/config';
import {
	createSharingShare,
	deleteSharingShare,
	formatSharingShare,
	getSharingShareById,
	listSharingShares,
} from '@/src/server/sharing/store';

const API_DISABLED_MESSAGE = 'The Unified Sharing API is not enabled.';
const SHARE_NOT_FOUND = 'Share not found.';
const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const OCS_JSON_HEADERS = {
	'content-type': 'application/json; charset=utf-8',
	'cache-control': 'no-store, no-cache, must-revalidate',
};

type GateAuth = 'required' | 'public';

function ocsStringErrorResponse(
	ocsVersion: OcsApiVersion,
	statuscode: number,
	data: string,
): Response {
	const envelope = {
		ocs: {
			meta: {
				status: 'failure' as const,
				statuscode,
				message: '',
				...(ocsVersion === 1 ? { totalitems: '', itemsperpage: '' } : {}),
			},
			data,
		},
	};

	return Response.json(envelope, {
		status: getOcsHttpStatus(ocsVersion, statuscode),
		headers: OCS_JSON_HEADERS,
	});
}

function checkGate(request: Request, auth: GateAuth): Response | null {
	const ocsVersion = parseOcsVersion(request);

	if (auth === 'required' && !resolveAuthenticatedUserId(request)) {
		return ocsUnauthorizedResponse(ocsVersion);
	}

	if (!isSharingV1ApiEnabled()) {
		return ocsFailureResponse(ocsVersion, 501, API_DISABLED_MESSAGE, {});
	}

	return null;
}

function requireUser(request: Request): string | Response {
	const userId = resolveAuthenticatedUserId(request);

	if (!userId) {
		return ocsUnauthorizedResponse(parseOcsVersion(request));
	}

	return userId;
}

function parseLimit(
	request: Request,
	value: string | null,
	defaultValue: number,
	maxValue: number,
): number | Response {
	const ocsVersion = parseOcsVersion(request);
	const limit = value === null ? defaultValue : Number.parseInt(value, 10);

	if (Number.isNaN(limit) || limit < 1) {
		return ocsBadRequestStringResponse(ocsVersion, 'The limit is too low.');
	}

	if (limit > maxValue) {
		return ocsBadRequestStringResponse(ocsVersion, 'The limit is too high.');
	}

	return limit;
}

function generateSecretValue(): string {
	if (process.env.NC_PARITY_DETERMINISTIC_SHARE_TOKENS === 'true') {
		return 'paritySecret012345678901234567';
	}

	let secret = '';

	for (let index = 0; index < 32; index += 1) {
		secret += CHARSET[Math.floor(Math.random() * CHARSET.length)];
	}

	return secret;
}

export function handleGenerateSecret(request: Request): Response {
	const blocked = checkGate(request, 'public');

	if (blocked) {
		return blocked;
	}

	return ocsSuccessResponse(generateSecretValue(), parseOcsVersion(request));
}

export function handleCreateShare(request: Request): Response {
	const blocked = checkGate(request, 'required');

	if (blocked) {
		return blocked;
	}

	const userId = requireUser(request);

	if (userId instanceof Response) {
		return userId;
	}

	const share = createSharingShare(userId);

	return ocsCreatedResponse(formatSharingShare(request, share), parseOcsVersion(request));
}

export function handleGetShares(request: Request): Response {
	const blocked = checkGate(request, 'required');

	if (blocked) {
		return blocked;
	}

	const userId = requireUser(request);

	if (userId instanceof Response) {
		return userId;
	}

	const url = new URL(request.url);
	const limit = parseLimit(request, url.searchParams.get('limit'), 100, 100);

	if (limit instanceof Response) {
		return limit;
	}

	const filterSourceTypeValue = url.searchParams.get('filterSourceTypeValue');

	if (filterSourceTypeValue === '') {
		return ocsBadRequestStringResponse(parseOcsVersion(request), 'Filter source value is empty.');
	}

	const filterSourceTypeClass = url.searchParams.get('filterSourceTypeClass');

	if (filterSourceTypeClass) {
		return ocsBadRequestStringResponse(
			parseOcsVersion(request),
			`The filter source type is not registered: ${filterSourceTypeClass}`,
		);
	}

	const filterState = url.searchParams.get('filterState');

	if (filterState !== null && !['active', 'draft', 'deleted'].includes(filterState)) {
		return ocsBadRequestStringResponse(
			parseOcsVersion(request),
			`"${filterState}" is not a valid backing value for enum NCU\\Sharing\\ShareState`,
		);
	}

	const filterUserStatus = url.searchParams.get('filterUserStatus');

	if (filterUserStatus !== null && !['pending', 'accepted', 'rejected'].includes(filterUserStatus)) {
		return ocsBadRequestStringResponse(
			parseOcsVersion(request),
			`"${filterUserStatus}" is not a valid backing value for enum NCU\\Sharing\\ShareUserStatus`,
		);
	}

	const lastShareId = url.searchParams.get('lastShareID');
	const shares = listSharingShares(userId, lastShareId, limit)
		.filter((share) => filterState === null || share.state === filterState)
		.filter((share) => filterUserStatus === null || share.userStatus === filterUserStatus);

	return ocsSuccessResponse(
		shares.map((share) => formatSharingShare(request, share)),
		parseOcsVersion(request),
	);
}

export async function handleGetShare(request: Request, id: string): Promise<Response> {
	const blocked = checkGate(request, 'public');

	if (blocked) {
		return blocked;
	}

	const share = getSharingShareById(id);

	if (!share) {
		return ocsStringErrorResponse(parseOcsVersion(request), 404, SHARE_NOT_FOUND);
	}

	return ocsSuccessResponse(formatSharingShare(request, share), parseOcsVersion(request));
}

export function handleGetShareMethodNotAllowed(request: Request): Response {
	const blocked = checkGate(request, 'public');

	if (blocked) {
		return blocked;
	}

	const ocsVersion = parseOcsVersion(request);
	const envelope = buildOcsFailureEnvelope(ocsVersion, 405, '');

	return Response.json(envelope, {
		status: getOcsHttpStatus(ocsVersion, 405),
		headers: OCS_JSON_HEADERS,
	});
}

export function handleDeleteShare(request: Request, id: string): Response {
	const blocked = checkGate(request, 'required');

	if (blocked) {
		return blocked;
	}

	const userId = requireUser(request);

	if (userId instanceof Response) {
		return userId;
	}

	const share = getSharingShareById(id);

	if (!share) {
		return ocsStringErrorResponse(parseOcsVersion(request), 404, SHARE_NOT_FOUND);
	}

	if (share.ownerId !== userId) {
		return ocsStringErrorResponse(
			parseOcsVersion(request),
			403,
			'You are not allowed to edit this share.',
		);
	}

	deleteSharingShare(id);

	return new Response(null, {
		status: 204,
		headers: {
			'cache-control': 'no-store, no-cache, must-revalidate',
		},
	});
}

export function handleSearchRecipients(request: Request): Response {
	const blocked = checkGate(request, 'required');

	if (blocked) {
		return blocked;
	}

	const userId = requireUser(request);

	if (userId instanceof Response) {
		return userId;
	}

	const url = new URL(request.url);
	const limit = parseLimit(request, url.searchParams.get('limit'), 10, 100);

	if (limit instanceof Response) {
		return limit;
	}

	const offset = Number.parseInt(url.searchParams.get('offset') ?? '0', 10);

	if (Number.isNaN(offset) || offset < 0) {
		return ocsBadRequestStringResponse(parseOcsVersion(request), 'The offset is too low.');
	}

	const shareId = url.searchParams.get('id');

	if (shareId && !getSharingShareById(shareId)) {
		return ocsStringErrorResponse(parseOcsVersion(request), 404, SHARE_NOT_FOUND);
	}

	return ocsSuccessResponse([], parseOcsVersion(request));
}
