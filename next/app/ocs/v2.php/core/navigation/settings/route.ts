import { requireAuthenticatedUser } from '@/src/server/ocs/auth';
import {
	etagMatches,
	generateNavigationETag,
	getSettingsNavigation,
} from '@/src/server/ocs/navigation';
import { ocsNotModifiedResponse, ocsSuccessResponse, parseOcsVersion } from '@/src/server/ocs/respond';

export async function GET(request: Request) {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const url = new URL(request.url);
	const absolute = url.searchParams.get('absolute') === 'true';
	const origin = url.origin;
	const navigation = getSettingsNavigation(absolute, origin);
	const etag = generateNavigationETag(navigation);

	if (etagMatches(request.headers.get('if-none-match'), etag)) {
		return ocsNotModifiedResponse();
	}

	return ocsSuccessResponse(navigation, parseOcsVersion(request), {
		etag,
	});
}
