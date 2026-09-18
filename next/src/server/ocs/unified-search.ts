import { createHash } from 'node:crypto';
import { getParityUsers } from '@/src/server/config/users';

export interface UnifiedSearchProvider {
	id: string;
	appId: string;
	name: string;
	icon: string;
	order: number;
	isExternalProvider: boolean;
	triggers: string[];
	filters: Record<string, string>;
	inAppSearch: boolean;
}

export interface UnifiedSearchResultEntry {
	thumbnailUrl: string;
	title: string;
	subline: string;
	resourceUrl: string;
	icon: string;
	rounded: boolean;
	attributes: Record<string, string>;
}

export interface UnifiedSearchResult {
	name: string;
	isPaginated: boolean;
	entries: UnifiedSearchResultEntry[];
	cursor: number | string | null;
}

const MIN_SEARCH_LENGTH = Number.parseInt(process.env.NC_UNIFIED_SEARCH_MIN_LENGTH ?? '1', 10);
const MAX_RESULTS_PER_REQUEST = Number.parseInt(process.env.NC_UNIFIED_SEARCH_MAX_RESULTS ?? '25', 10);
const DEFAULT_LIMIT = 5;

const PARITY_PROVIDERS: UnifiedSearchProvider[] = [
	{
		id: 'parity-users',
		appId: 'core',
		name: 'Users',
		icon: '/core/img/places/default-app-icon.svg',
		order: 5,
		isExternalProvider: false,
		triggers: ['parity-users'],
		filters: { term: 'string' },
		inAppSearch: false,
	},
];

const PROVIDER_BY_ID = new Map(PARITY_PROVIDERS.map((provider) => [provider.id, provider]));

export function getUnifiedSearchProviders(): UnifiedSearchProvider[] {
	return PARITY_PROVIDERS.map((provider) => ({ ...provider }));
}

export function generateUnifiedSearchProvidersETag(providers: UnifiedSearchProvider[]): string {
	return `"${createHash('md5').update(JSON.stringify(providers)).digest('hex')}"`;
}

export type UnifiedSearchFilterBuildResult =
	| { status: 'ok'; filters: Record<string, string> }
	| { status: 'unknown' }
	| { status: 'empty' };

export function buildUnifiedSearchFilters(
	providerId: string,
	params: Record<string, string | undefined>,
): UnifiedSearchFilterBuildResult {
	const provider = PROVIDER_BY_ID.get(providerId);

	if (!provider) {
		return { status: 'unknown' };
	}

	const filters: Record<string, string> = {};

	for (const [name, value] of Object.entries(params)) {
		if (value === undefined || !provider.filters[name]) {
			continue;
		}

		if (name === 'term' && value.trim().length < MIN_SEARCH_LENGTH) {
			continue;
		}

		filters[name] = value;
	}

	if (Object.keys(filters).length === 0) {
		return { status: 'empty' };
	}

	return { status: 'ok', filters };
}

export function searchUnifiedProvider(
	providerId: string,
	filters: Record<string, string>,
	limit: number,
): UnifiedSearchResult {
	const provider = PROVIDER_BY_ID.get(providerId)!;
	const cappedLimit = Math.max(1, Math.min(limit, MAX_RESULTS_PER_REQUEST));

	if (providerId === 'parity-users') {
		const term = (filters.term ?? '').toLowerCase();
		const matches = getParityUsers().filter((user) => (
			user.id.toLowerCase().includes(term)
			|| user.label.toLowerCase().includes(term)
			|| user.displayName.toLowerCase().includes(term)
		));

		return {
			name: provider.name,
			isPaginated: false,
			entries: matches.slice(0, cappedLimit).map((user) => ({
				thumbnailUrl: '',
				title: user.displayName,
				subline: user.id,
				resourceUrl: `/index.php/settings/users/${user.id}`,
				icon: '',
				rounded: false,
				attributes: {},
			})),
			cursor: null,
		};
	}

	return {
		name: provider.name,
		isPaginated: false,
		entries: [],
		cursor: null,
	};
}

export function parseUnifiedSearchLimit(rawLimit: string | null): number {
	if (rawLimit === null) {
		return DEFAULT_LIMIT;
	}

	const parsed = Number.parseInt(rawLimit, 10);

	if (Number.isNaN(parsed)) {
		return DEFAULT_LIMIT;
	}

	return parsed;
}

export const NO_VALID_FILTERS_MESSAGE = 'No valid filters provided';
