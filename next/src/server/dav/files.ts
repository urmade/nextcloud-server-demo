import { buildDavHref, ingressBasePath } from './remote';
import { getAdminFilesHome, getDefaultDavUserId, getEmptyPrincipalCollection } from './store';
import type { DavFileNode, ParsedDavRequest } from './types';

const OWN_HOME_PERMISSIONS = 'RGDNVCK';
const EMPTY_COLLECTION_PERMISSIONS = 'G';

export interface ResolvedDavResource {
	node: DavFileNode;
	href: string;
	permissions: string;
}

function splitSegments(path: string): string[] {
	return path.split('/').filter(Boolean);
}

function findChild(node: DavFileNode, name: string): DavFileNode | null {
	return node.children?.find((child) => child.name === name) ?? null;
}

function resolveWithinHome(
	home: DavFileNode,
	relativeSegments: string[],
	requestPath: string,
): ResolvedDavResource | 'not-found' {
	let current = home;
	let currentPath = requestPath;

	if (relativeSegments.length === 0) {
		return {
			node: current,
			href: buildDavHref(currentPath, true),
			permissions: OWN_HOME_PERMISSIONS,
		};
	}

	for (let index = 0; index < relativeSegments.length; index += 1) {
		const segment = relativeSegments[index];
		const child = findChild(current, segment);

		if (!child) {
			return 'not-found';
		}

		current = child;
		currentPath = `${currentPath.replace(/\/?$/, '')}/${segment}`;
	}

	return {
		node: current,
		href: buildDavHref(currentPath, current.kind === 'directory'),
		permissions: OWN_HOME_PERMISSIONS,
	};
}

function resolveV2Resource(parsed: ParsedDavRequest, userId: string): ResolvedDavResource | 'not-found' | 'unsupported' {
	const segments = splitSegments(parsed.davPath);

	if (segments.length === 0 || segments[0] !== 'files') {
		return 'unsupported';
	}

	if (segments.length === 1) {
		return 'unsupported';
	}

	const principalName = segments[1];
	const relativeSegments = segments.slice(2);
	const basePath = `${ingressBasePath('v2')}/files/${principalName}`;
	const requestPath = relativeSegments.length === 0
		? basePath
		: `${basePath}/${relativeSegments.join('/')}`;

	if (principalName !== userId) {
		const empty = getEmptyPrincipalCollection(principalName);

		if (relativeSegments.length === 0) {
			return {
				node: empty,
				href: buildDavHref(requestPath, true),
				permissions: EMPTY_COLLECTION_PERMISSIONS,
			};
		}

		return 'not-found';
	}

	return resolveWithinHome(getAdminFilesHome(), relativeSegments, requestPath);
}

function resolveLegacyResource(parsed: ParsedDavRequest, userId: string): ResolvedDavResource | 'not-found' {
	if (userId !== getDefaultDavUserId()) {
		return 'not-found';
	}

	const relativeSegments = splitSegments(parsed.davPath);
	const basePath = ingressBasePath(parsed.ingress);
	const requestPath = relativeSegments.length === 0
		? basePath
		: `${basePath}/${relativeSegments.join('/')}`;

	return resolveWithinHome(getAdminFilesHome(), relativeSegments, requestPath);
}

export function resolveDavResource(parsed: ParsedDavRequest, userId: string): ResolvedDavResource | 'not-found' | 'unsupported' {
	if (parsed.ingress === 'v2') {
		return resolveV2Resource(parsed, userId);
	}

	return resolveLegacyResource(parsed, userId);
}

export function collectPropfindResponses(
	resource: ResolvedDavResource,
	depth: number,
): ResolvedDavResource[] {
	const responses = [resource];

	if (depth < 1 || resource.node.kind !== 'directory') {
		return responses;
	}

	for (const child of resource.node.children ?? []) {
		const childPath = `${resource.href.replace(/\/?$/, '')}/${child.name}`;
		responses.push({
			node: child,
			href: buildDavHref(childPath, child.kind === 'directory'),
			permissions: resource.permissions,
		});
	}

	return responses;
}

export function parseDepthHeader(value: string | null): number {
	const normalized = value?.trim().toLowerCase();

	if (!normalized || normalized === '0') {
		return 0;
	}

	if (normalized === '1') {
		return 1;
	}

	if (normalized === 'infinity') {
		return Number.POSITIVE_INFINITY;
	}

	return 0;
}
