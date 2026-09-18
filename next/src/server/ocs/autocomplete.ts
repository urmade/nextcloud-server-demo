import { getParityUsers } from '@/src/server/config/users';

export interface AutocompleteResult {
	id: string;
	label: string;
	icon: string;
	source: string;
	status: string;
	subline: string;
	shareWithDisplayNameUnique: string;
}

export interface AutocompleteSearchResult {
	results: AutocompleteResult[];
	hasMoreResults: boolean;
}

export function searchAutocomplete(
	search: string,
	limit: number,
	offset: number,
): AutocompleteSearchResult {
	const needle = search.toLowerCase();
	const matches = getParityUsers().filter((user) => (
		user.id.toLowerCase().includes(needle)
		|| user.label.toLowerCase().includes(needle)
		|| user.displayName.toLowerCase().includes(needle)
	));

	const page = matches.slice(offset, offset + limit);

	return {
		results: page.map((user) => ({
			id: user.id,
			label: user.label,
			icon: '',
			source: 'users',
			status: '',
			subline: '',
			shareWithDisplayNameUnique: '',
		})),
		hasMoreResults: offset + limit < matches.length,
	};
}

export function buildAutocompleteNextLink(
	request: Request,
	search: string,
	limit: number,
	offset: number,
): string | undefined {
	const url = new URL(request.url);
	const nextOffset = offset + limit;

	url.searchParams.set('search', search);
	url.searchParams.set('limit', String(limit));
	url.searchParams.set('offset', String(nextOffset));

	return `<${url.toString()}>; rel="next"`;
}
