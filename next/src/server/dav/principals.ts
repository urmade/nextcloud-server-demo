import { parseDepthHeader } from './files';
import { buildDavHref } from './remote';
import {
	findCalendarResourcePrincipal,
	findCalendarRoomPrincipal,
	findGroupPrincipal,
	findRemoteUserPrincipal,
	findSystemPrincipal,
	findUserPrincipal,
	isDavListingEnabled,
	listGroupPrincipalRecords,
	listUserPrincipalRecords,
	type PrincipalRecord,
} from './principals-store';
import type { ParsedDavRequest } from './types';
import { buildPrincipalPropfindMultistatus } from './xml';

export type PrincipalKind =
	| 'users'
	| 'groups'
	| 'system'
	| 'calendar-resources'
	| 'calendar-rooms'
	| 'remote-users';

export interface ParsedPrincipalPath {
	kind: PrincipalKind;
	principalId?: string;
	isCollectionRoot: boolean;
	requestPath: string;
}

const PRINCIPAL_KINDS = new Set<PrincipalKind>([
	'users',
	'groups',
	'system',
	'calendar-resources',
	'calendar-rooms',
	'remote-users',
]);

function splitSegments(path: string): string[] {
	return path.split('/').filter(Boolean);
}

export function isPrincipalPath(parsed: ParsedDavRequest): boolean {
	const segments = splitSegments(parsed.davPath);

	return segments[0] === 'principals' && segments.length >= 2 && PRINCIPAL_KINDS.has(segments[1] as PrincipalKind);
}

export function isPublicPrincipalPath(davPath: string): boolean {
	return davPath === 'principals/system/public'
		|| davPath.startsWith('principals/system/public/');
}

export function parsePrincipalPath(parsed: ParsedDavRequest): ParsedPrincipalPath | null {
	const segments = splitSegments(parsed.davPath);

	if (segments[0] !== 'principals' || segments.length < 2) {
		return null;
	}

	const kind = segments[1] as PrincipalKind;

	if (!PRINCIPAL_KINDS.has(kind)) {
		return null;
	}

	return {
		kind,
		principalId: segments[2],
		isCollectionRoot: segments.length === 2,
		requestPath: buildDavHref(parsed.requestPath, true),
	};
}

function collectionRootRecord(kind: PrincipalKind, requestPath: string): PrincipalRecord {
	return {
		uri: `principals/${kind}`,
		displayName: kind,
		href: requestPath,
		isCollection: true,
	};
}

function resolvePrincipalRecord(parsed: ParsedPrincipalPath): PrincipalRecord | 'not-found' {
	if (parsed.isCollectionRoot) {
		return collectionRootRecord(parsed.kind, parsed.requestPath);
	}

	const principalId = parsed.principalId;

	if (!principalId) {
		return 'not-found';
	}

	switch (parsed.kind) {
		case 'users':
			return findUserPrincipal(principalId) ?? 'not-found';
		case 'groups':
			return findGroupPrincipal(principalId) ?? 'not-found';
		case 'system':
			return findSystemPrincipal(principalId) ?? 'not-found';
		case 'calendar-resources':
			return findCalendarResourcePrincipal(principalId) ?? 'not-found';
		case 'calendar-rooms':
			return findCalendarRoomPrincipal(principalId) ?? 'not-found';
		case 'remote-users':
			return findRemoteUserPrincipal(principalId) ?? 'not-found';
	}
}

function listChildPrincipals(parsed: ParsedPrincipalPath): PrincipalRecord[] {
	if (!parsed.isCollectionRoot || !isDavListingEnabled()) {
		return [];
	}

	switch (parsed.kind) {
		case 'users':
			return listUserPrincipalRecords();
		case 'groups':
			return listGroupPrincipalRecords();
		default:
			return [];
	}
}

function enrichPrincipalRecord(record: PrincipalRecord): PrincipalRecord {
	return record;
}

export function collectPrincipalPropfindResponses(
	parsed: ParsedPrincipalPath,
	depth: number,
): PrincipalRecord[] | 'not-found' {
	const resolved = resolvePrincipalRecord(parsed);

	if (resolved === 'not-found') {
		return 'not-found';
	}

	const responses = [enrichPrincipalRecord(resolved)];

	if (depth < 1 || !resolved.isCollection) {
		return responses;
	}

	for (const child of listChildPrincipals(parsed)) {
		responses.push(enrichPrincipalRecord(child));
	}

	return responses;
}

export function buildPrincipalPropfindBody(
	parsed: ParsedPrincipalPath,
	depth: number,
): string | 'not-found' {
	const responses = collectPrincipalPropfindResponses(parsed, depth);

	if (responses === 'not-found') {
		return 'not-found';
	}

	return buildPrincipalPropfindMultistatus(responses);
}

export function parsePrincipalDepth(request: Request): number {
	const depthHeader = request.headers.get('depth') ?? request.headers.get('Depth');
	const depth = parseDepthHeader(depthHeader);

	if (Number.isFinite(depth) && depth > 1) {
		return 1;
	}

	return depth;
}
