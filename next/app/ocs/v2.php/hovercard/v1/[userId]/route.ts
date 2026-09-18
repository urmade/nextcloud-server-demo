import { requireAuthenticatedUser } from '@/src/server/ocs/auth';
import { getHoverCardUser } from '@/src/server/ocs/hover-card';
import { ocsFailureResponse, ocsSuccessResponse, parseOcsVersion } from '@/src/server/ocs/respond';

export async function GET(
	request: Request,
	context: { params: Promise<{ userId: string }> },
) {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const { userId } = await context.params;
	const ocsVersion = parseOcsVersion(request);
	const hoverCard = getHoverCardUser(userId);

	if (!hoverCard) {
		return ocsFailureResponse(ocsVersion, 404, '', []);
	}

	return ocsSuccessResponse(hoverCard, ocsVersion);
}
