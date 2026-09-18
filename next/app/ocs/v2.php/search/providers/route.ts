import { requireAuthenticatedUser } from '@/src/server/ocs/auth';
import {
	generateUnifiedSearchProvidersETag,
	getUnifiedSearchProviders,
} from '@/src/server/ocs/unified-search';
import { ocsSuccessResponse, parseOcsVersion } from '@/src/server/ocs/respond';

export async function GET(request: Request) {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const providers = getUnifiedSearchProviders();
	const etag = generateUnifiedSearchProvidersETag(providers);

	return ocsSuccessResponse(providers, parseOcsVersion(request), {
		etag,
	});
}
