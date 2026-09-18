import { requireAuthenticatedUser } from '@/src/server/ocs/auth';
import {
	buildUnifiedSearchFilters,
	NO_VALID_FILTERS_MESSAGE,
	parseUnifiedSearchLimit,
	searchUnifiedProvider,
} from '@/src/server/ocs/unified-search';
import {
	ocsBadRequestStringResponse,
	ocsFailureResponse,
	ocsSuccessResponse,
	parseOcsVersion,
} from '@/src/server/ocs/respond';

export async function GET(
	request: Request,
	context: { params: Promise<{ providerId: string }> },
) {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const { providerId } = await context.params;
	const ocsVersion = parseOcsVersion(request);
	const url = new URL(request.url);

	const queryParams: Record<string, string | undefined> = {
		term: url.searchParams.get('term') ?? undefined,
		sortOrder: url.searchParams.get('sortOrder') ?? undefined,
		limit: url.searchParams.get('limit') ?? undefined,
		cursor: url.searchParams.get('cursor') ?? undefined,
		from: url.searchParams.get('from') ?? undefined,
	};

	const filterResult = buildUnifiedSearchFilters(providerId, queryParams);

	if (filterResult.status === 'unknown') {
		return ocsFailureResponse(ocsVersion, 996, `Provider ${providerId} is unknown`);
	}

	if (filterResult.status === 'empty') {
		return ocsBadRequestStringResponse(ocsVersion, NO_VALID_FILTERS_MESSAGE);
	}

	const limit = parseUnifiedSearchLimit(url.searchParams.get('limit'));
	const result = searchUnifiedProvider(providerId, filterResult.filters, limit);

	return ocsSuccessResponse(result, ocsVersion);
}
