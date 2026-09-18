import { createHash } from 'node:crypto';
import { URL_REGEX_NO_MODIFIERS } from '@/src/server/ocs/capabilities';
import { requireAuthenticatedUser } from '@/src/server/ocs/auth';
import { ocsSuccessResponse, parseOcsVersion } from '@/src/server/ocs/respond';

const URL_REGEX = new RegExp(URL_REGEX_NO_MODIFIERS, 'gim');
const PUBLIC_LIMIT_MAX = 15;
const DEFAULT_LIMIT = 1;

export const PARITY_REFERENCE_URL = 'https://parity.example.com/page';
export const PARITY_SHARING_TOKEN = 'parity-share-token';
export const PARITY_DISCOVERABLE_PROVIDER_ID = 'parity-link';

export interface OpenGraphObject {
	id: string;
	name: string;
	description: string | null;
	thumb: string | null;
	link: string;
}

export interface CoreReference {
	richObjectType: string;
	richObject: OpenGraphObject;
	openGraphObject: OpenGraphObject;
	accessible: boolean;
}

export interface CoreReferenceProvider {
	id: string;
	title: string;
	icon_url: string;
	order: number;
	search_providers_ids: string[] | null;
}

const PARITY_DISCOVERABLE_PROVIDERS: CoreReferenceProvider[] = [
	{
		id: PARITY_DISCOVERABLE_PROVIDER_ID,
		title: 'Parity links',
		icon_url: '/core/img/places/link.svg',
		order: 0,
		search_providers_ids: null,
	},
];

const providerLastUse = new Map<string, Map<string, number>>();

function getRequestOrigin(request: Request): string {
	const forwardedHost = request.headers.get('x-forwarded-host');
	const host = forwardedHost ?? request.headers.get('host') ?? '127.0.0.1:3100';
	const proto = request.headers.get('x-forwarded-proto') ?? 'http';

	return `${proto}://${host}`;
}

function referencePreviewUrl(referenceId: string, origin: string): string {
	const referenceHash = createHash('md5').update(referenceId).digest('hex');

	return `${origin}/index.php/core/references/preview/${referenceHash}`;
}

function matchesParityReference(referenceId: string): boolean {
	return referenceId.includes('parity.example.com');
}

function buildParityReference(referenceId: string, origin: string): CoreReference {
	const openGraphObject: OpenGraphObject = {
		id: referenceId,
		name: 'Parity Example',
		description: 'Parity reference fixture',
		thumb: referencePreviewUrl(referenceId, origin),
		link: referenceId,
	};

	return {
		richObjectType: 'open-graph',
		richObject: openGraphObject,
		openGraphObject,
		accessible: true,
	};
}

export function extractReferencesFromText(text: string): string[] {
	const matches = text.match(URL_REGEX) ?? [];

	return matches.map((match) => match.trim()).filter((match) => match.length > 0);
}

export function resolveReference(
	referenceId: string,
	origin: string,
	_public = false,
	_sharingToken = '',
): CoreReference | null {
	const trimmed = referenceId.trim();

	if (!matchesParityReference(trimmed)) {
		return null;
	}

	return buildParityReference(trimmed, origin);
}

export function getDiscoverableProviders(): CoreReferenceProvider[] {
	return PARITY_DISCOVERABLE_PROVIDERS.map((provider) => ({ ...provider }));
}

export function touchProvider(userId: string, providerId: string, timestamp?: number | null): boolean {
	const provider = PARITY_DISCOVERABLE_PROVIDERS.find((entry) => entry.id === providerId);

	if (!provider) {
		return false;
	}

	const userProviders = providerLastUse.get(userId) ?? new Map<string, number>();
	userProviders.set(providerId, timestamp ?? Math.floor(Date.now() / 1000));
	providerLastUse.set(userId, userProviders);

	return true;
}

function parseLimit(rawLimit: unknown, capPublic = false): number {
	const parsed = typeof rawLimit === 'number'
		? rawLimit
		: Number.parseInt(String(rawLimit ?? DEFAULT_LIMIT), 10);
	const limit = Number.isNaN(parsed) ? DEFAULT_LIMIT : parsed;

	if (capPublic) {
		return Math.min(limit, PUBLIC_LIMIT_MAX);
	}

	return limit;
}

async function parseJsonBody<T extends Record<string, unknown>>(request: Request): Promise<T> {
	try {
		return await request.json() as T;
	} catch {
		return {} as T;
	}
}

function buildExtractResult(
	text: string,
	resolve: boolean,
	limit: number,
	origin: string,
	publicMode: boolean,
	sharingToken = '',
): Record<string, CoreReference | null> {
	const references = extractReferencesFromText(text);
	const result: Record<string, CoreReference | null> = {};
	let index = 0;

	for (const reference of references) {
		if (index++ >= limit) {
			break;
		}

		result[reference] = resolve
			? resolveReference(reference, origin, publicMode, sharingToken)
			: null;
	}

	return result;
}

function resolveCacheHeaders(): Record<string, string> {
	return {
		'cache-control': 'private, max-age=3600, immutable',
	};
}

export async function handleExtractReferences(request: Request): Promise<Response> {
	const ocsVersion = parseOcsVersion(request);
	const userId = requireAuthenticatedUser(request);

	if (userId instanceof Response) {
		return userId;
	}

	const body = await parseJsonBody<{
		text?: string;
		resolve?: boolean;
		limit?: number;
	}>(request);

	const text = body.text ?? '';
	const resolve = body.resolve === true;
	const limit = parseLimit(body.limit);

	return ocsSuccessResponse({
		references: buildExtractResult(text, resolve, limit, getRequestOrigin(request), false),
	}, ocsVersion);
}

export async function handleExtractPublicReferences(request: Request): Promise<Response> {
	const ocsVersion = parseOcsVersion(request);
	const body = await parseJsonBody<{
		text?: string;
		sharingToken?: string;
		resolve?: boolean;
		limit?: number;
	}>(request);

	const text = body.text ?? '';
	const sharingToken = body.sharingToken ?? '';
	const resolve = body.resolve === true;
	const limit = parseLimit(body.limit, true);

	return ocsSuccessResponse({
		references: buildExtractResult(text, resolve, limit, getRequestOrigin(request), true, sharingToken),
	}, ocsVersion);
}

export async function handleResolveOne(request: Request): Promise<Response> {
	const ocsVersion = parseOcsVersion(request);
	const userId = requireAuthenticatedUser(request);

	if (userId instanceof Response) {
		return userId;
	}

	const url = new URL(request.url);
	const reference = url.searchParams.get('reference') ?? '';
	const resolved = resolveReference(reference, getRequestOrigin(request));

	return ocsSuccessResponse({
		references: {
			[reference]: resolved,
		},
	}, ocsVersion, resolveCacheHeaders());
}

export async function handleResolveOnePublic(request: Request): Promise<Response> {
	const ocsVersion = parseOcsVersion(request);
	const url = new URL(request.url);
	const reference = url.searchParams.get('reference') ?? '';
	const sharingToken = url.searchParams.get('sharingToken') ?? '';
	const resolved = resolveReference(reference, getRequestOrigin(request), true, sharingToken);

	return ocsSuccessResponse({
		references: {
			[reference]: resolved,
		},
	}, ocsVersion, resolveCacheHeaders());
}

export async function handleResolveMany(request: Request): Promise<Response> {
	const ocsVersion = parseOcsVersion(request);
	const userId = requireAuthenticatedUser(request);

	if (userId instanceof Response) {
		return userId;
	}

	const body = await parseJsonBody<{
		references?: string[];
		limit?: number;
	}>(request);
	const references = Array.isArray(body.references) ? body.references : [];
	const limit = parseLimit(body.limit);
	const origin = getRequestOrigin(request);
	const result: Record<string, CoreReference | null> = {};
	let index = 0;

	for (const reference of references) {
		if (index++ >= limit) {
			break;
		}

		result[reference] = resolveReference(reference, origin);
	}

	return ocsSuccessResponse({ references: result }, ocsVersion);
}

export async function handleResolvePublicMany(request: Request): Promise<Response> {
	const ocsVersion = parseOcsVersion(request);
	const body = await parseJsonBody<{
		references?: string[];
		sharingToken?: string;
		limit?: number;
	}>(request);
	const references = Array.isArray(body.references) ? body.references : [];
	const sharingToken = body.sharingToken ?? '';
	const limit = parseLimit(body.limit, true);
	const origin = getRequestOrigin(request);
	const result: Record<string, CoreReference | null> = {};
	let index = 0;

	for (const reference of references) {
		if (index++ >= limit) {
			break;
		}

		result[reference] = resolveReference(reference, origin, true, sharingToken);
	}

	return ocsSuccessResponse({ references: result }, ocsVersion);
}

export async function handleGetProvidersInfo(request: Request): Promise<Response> {
	const ocsVersion = parseOcsVersion(request);
	const userId = requireAuthenticatedUser(request);

	if (userId instanceof Response) {
		return userId;
	}

	return ocsSuccessResponse(getDiscoverableProviders(), ocsVersion);
}

export async function handleTouchProvider(request: Request, providerId: string): Promise<Response> {
	const ocsVersion = parseOcsVersion(request);
	const userId = requireAuthenticatedUser(request);

	if (userId instanceof Response) {
		return userId;
	}

	const body = await parseJsonBody<{ timestamp?: number | null }>(request);
	const success = touchProvider(userId, providerId, body.timestamp);

	return ocsSuccessResponse({ success }, ocsVersion);
}
