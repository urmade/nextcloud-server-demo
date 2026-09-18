import { findParityUser } from '@/src/server/config/users';
import { requireAuthenticatedUser } from '@/src/server/ocs/auth';
import {
	ocsFailureResponse,
	ocsSuccessResponse,
	parseOcsVersion,
} from '@/src/server/ocs/respond';
import { formatDeletedShare } from './format';
import {
	getShareByFullId,
	listDeletedSharesForUser,
	restoreDeletedShare,
} from './store';

const SHARE_NOT_FOUND = 'Share not found';
const NO_DELETED_SHARE = 'No deleted share found';

export function handleGetDeletedShares(request: Request): Response {
	const ocsVersion = parseOcsVersion(request);
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const deleted = listDeletedSharesForUser(auth)
		.map((share) => formatDeletedShare(share, auth))
		.filter((entry): entry is NonNullable<typeof entry> => entry !== null);

	return ocsSuccessResponse(deleted, ocsVersion);
}

export function handleUndeleteShare(request: Request, id: string): Response {
	const ocsVersion = parseOcsVersion(request);
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const share = getShareByFullId(id);

	if (!share) {
		return ocsFailureResponse(ocsVersion, 404, SHARE_NOT_FOUND);
	}

	if (!share.deletedFromSelf.includes(auth)) {
		return ocsFailureResponse(ocsVersion, 404, NO_DELETED_SHARE);
	}

	if (!findParityUser(share.shareOwner)) {
		return ocsFailureResponse(ocsVersion, 404, NO_DELETED_SHARE);
	}

	restoreDeletedShare(share.id, auth);

	return ocsSuccessResponse([], ocsVersion);
}
