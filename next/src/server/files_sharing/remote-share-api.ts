import { requireAuthenticatedUser } from '@/src/server/ocs/auth';
import {
	ocsFailureResponse,
	ocsForbiddenResponse,
	ocsSuccessResponse,
	parseOcsVersion,
} from '@/src/server/ocs/respond';
import { SHARE_STATUS_ACCEPTED, SHARE_STATUS_PENDING } from './constants';
import {
	acceptExternalShare,
	canRemoveExternalShareMount,
	declineExternalShare,
	getExternalShareById,
	listExternalSharesForUser,
	removeExternalShare,
} from './external-share-store';
import { formatRemoteShare } from './format';
import type { FormattedRemoteShare } from './types';

const WRONG_SHARE_ID = 'Wrong share ID, share does not exist.';
const SHARE_DOES_NOT_EXIST = 'share does not exist';
const SHARE_NOT_FOUND = 'Share does not exist';
const COULD_NOT_UNSHARE = 'Could not unshare';

function formatRemoteShareList(shares: ReturnType<typeof listExternalSharesForUser>, userId: string): FormattedRemoteShare[] {
	return shares.map((share) => formatRemoteShare(share, userId));
}

export function handleGetOpenShares(request: Request): Response {
	const ocsVersion = parseOcsVersion(request);
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const shares = formatRemoteShareList(
		listExternalSharesForUser(auth, SHARE_STATUS_PENDING),
		auth,
	);

	return ocsSuccessResponse(shares, ocsVersion);
}

export function handleGetRemoteShares(request: Request): Response {
	const ocsVersion = parseOcsVersion(request);
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const shares = formatRemoteShareList(
		listExternalSharesForUser(auth, SHARE_STATUS_ACCEPTED),
		auth,
	);

	return ocsSuccessResponse(shares, ocsVersion);
}

export function handleGetRemoteShare(request: Request, id: string): Response {
	const ocsVersion = parseOcsVersion(request);
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const share = getExternalShareById(id, auth);

	if (!share) {
		return ocsFailureResponse(ocsVersion, 404, SHARE_DOES_NOT_EXIST);
	}

	return ocsSuccessResponse(formatRemoteShare(share, auth), ocsVersion);
}

export function handleAcceptRemoteShare(request: Request, id: string): Response {
	const ocsVersion = parseOcsVersion(request);
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const share = getExternalShareById(id, auth);

	if (!share || !acceptExternalShare(id, auth)) {
		return ocsFailureResponse(ocsVersion, 404, WRONG_SHARE_ID);
	}

	return ocsSuccessResponse([], ocsVersion);
}

export function handleDeclineRemoteShare(request: Request, id: string): Response {
	const ocsVersion = parseOcsVersion(request);
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const share = getExternalShareById(id, auth);

	if (!share || !declineExternalShare(id, auth)) {
		return ocsFailureResponse(ocsVersion, 404, WRONG_SHARE_ID);
	}

	return ocsSuccessResponse([], ocsVersion);
}

export function handleUnshareRemoteShare(request: Request, id: string): Response {
	const ocsVersion = parseOcsVersion(request);
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const share = getExternalShareById(id, auth);

	if (!share) {
		return ocsFailureResponse(ocsVersion, 404, SHARE_NOT_FOUND);
	}

	if (!canRemoveExternalShareMount(id, auth) || !removeExternalShare(id, auth)) {
		return ocsForbiddenResponse(ocsVersion, COULD_NOT_UNSHARE);
	}

	return ocsSuccessResponse([], ocsVersion);
}
