import { requireAuthenticatedUser } from '@/src/server/ocs/auth';
import { buildAutocompleteNextLink, searchAutocomplete } from '@/src/server/ocs/autocomplete';
import { ocsFailureResponse, ocsSuccessResponse, parseOcsVersion } from '@/src/server/ocs/respond';

export async function GET(request: Request) {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const url = new URL(request.url);
	const ocsVersion = parseOcsVersion(request);
	const search = url.searchParams.get('search');

	if (search === null) {
		return ocsFailureResponse(ocsVersion, 400, 'search parameter is required');
	}

	const limit = Number.parseInt(url.searchParams.get('limit') ?? '10', 10);
	const offset = Number.parseInt(url.searchParams.get('offset') ?? '0', 10);

	if (Number.isNaN(limit) || limit < 1) {
		return ocsFailureResponse(ocsVersion, 400, 'limit must be a positive integer');
	}

	if (Number.isNaN(offset) || offset < 0) {
		return ocsFailureResponse(ocsVersion, 400, 'offset must be a non-negative integer');
	}

	const { results, hasMoreResults } = searchAutocomplete(search, limit, offset);
	const headers: Record<string, string> = {};

	if (hasMoreResults) {
		const nextLink = buildAutocompleteNextLink(request, search, limit, offset);

		if (nextLink) {
			headers.link = nextLink;
		}
	}

	return ocsSuccessResponse(results, ocsVersion, headers);
}
