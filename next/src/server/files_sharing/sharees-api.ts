import { getParityUsers } from '@/src/server/config/users';
import { requireAuthenticatedUser } from '@/src/server/ocs/auth';
import {
	ocsFailureResponse,
	ocsSuccessResponse,
	parseOcsVersion,
} from '@/src/server/ocs/respond';
import { MAX_AUTOCOMPLETE_RESULTS } from './constants';
import type { ShareesSearchResult } from './types';

const EMPTY_RESULT: ShareesSearchResult = {
	exact: {
		users: [],
		groups: [],
		remotes: [],
		remote_groups: [],
		emails: [],
		circles: [],
		rooms: [],
	},
	users: [],
	groups: [],
	remotes: [],
	remote_groups: [],
	emails: [],
	lookup: [],
	circles: [],
	rooms: [],
	lookupEnabled: false,
};

function emptyUsersResult(): ShareesSearchResult {
	return {
		...EMPTY_RESULT,
		exact: { ...EMPTY_RESULT.exact },
	};
}

function searchUsers(search: string, limit: number): ShareesSearchResult {
	const needle = search.toLowerCase();
	const matches = getParityUsers().filter((user) => (
		user.id.toLowerCase().includes(needle)
		|| user.displayName.toLowerCase().includes(needle)
		|| user.label.toLowerCase().includes(needle)
	)).slice(0, limit).map((user) => ({
		label: user.label,
		value: {
			shareType: 0,
			shareWith: user.id,
		},
	}));

	return {
		...EMPTY_RESULT,
		exact: { ...EMPTY_RESULT.exact },
		users: matches,
	};
}

export function handleShareesSearch(request: Request): Response {
	const ocsVersion = parseOcsVersion(request);
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const url = new URL(request.url);
	const search = url.searchParams.get('search') ?? '';
	const itemType = url.searchParams.get('itemType');
	const page = Number.parseInt(url.searchParams.get('page') ?? '1', 10);
	const perPage = Number.parseInt(url.searchParams.get('perPage') ?? '200', 10);

	if (search.length < 0) {
		return ocsSuccessResponse(emptyUsersResult(), ocsVersion);
	}

	if (itemType === null) {
		return ocsFailureResponse(ocsVersion, 400, 'Missing itemType');
	}

	if (perPage <= 0) {
		return ocsFailureResponse(ocsVersion, 400, 'Invalid perPage argument');
	}

	if (page <= 0) {
		return ocsFailureResponse(ocsVersion, 400, 'Invalid page');
	}

	const limit = Math.min(perPage, MAX_AUTOCOMPLETE_RESULTS);

	if (search === '') {
		return ocsSuccessResponse(emptyUsersResult(), ocsVersion);
	}

	return ocsSuccessResponse(searchUsers(search, limit), ocsVersion);
}

export function handleShareesFindRecommended(request: Request): Response {
	const ocsVersion = parseOcsVersion(request);
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const url = new URL(request.url);
	const itemType = url.searchParams.get('itemType');

	if (!itemType) {
		return ocsFailureResponse(ocsVersion, 400, 'itemType is a required parameter');
	}

	return ocsSuccessResponse({
		exact: { ...EMPTY_RESULT.exact },
		users: [],
		groups: [],
		remotes: [],
		remote_groups: [],
		emails: [],
		circles: [],
		rooms: [],
	}, ocsVersion);
}
