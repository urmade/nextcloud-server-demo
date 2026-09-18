import { getAvatarFixture } from '@/src/server/fixtures/binary';
import { getDefaultDavUserId } from './store';
import { parseDepthHeader } from './files';
import { buildDavHref } from './remote';
import {
	COMMENT_ENTITY_TYPES,
	fileExistsInUserHome,
	getSystemTagById,
	isCommentEntityType,
	listAssignedTags,
	listSystemTags,
	listTagsForObject,
	userHasFilesFolder,
	type SystemTagRecord,
} from './tree-extras-store';
import type { ParsedDavRequest } from './types';
import {
	buildBadRequestXml,
	buildForbiddenXml,
	buildMethodNotAllowedXml,
	buildNotAuthenticatedXml,
	buildNotFoundXml,
} from './xml';

const APPLE_CONFIG_NAME = 'apple-provisioning.mobileconfig';
const TREE_EXTRAS_ROOTS = new Set([
	'avatars',
	'comments',
	'systemtags',
	'systemtags-relations',
	'systemtags-assigned',
	'provisioning',
]);

export type TreeExtrasKind =
	| 'avatars'
	| 'comments'
	| 'systemtags'
	| 'systemtags-relations'
	| 'systemtags-assigned'
	| 'apple-provisioning';

export interface ParsedTreeExtrasPath {
	kind: TreeExtrasKind;
	requestPath: string;
	userId?: string;
	avatarSize?: number;
	avatarExtension?: 'jpeg' | 'png';
	entityType?: string;
	objectId?: string;
	tagId?: string;
	mediaType?: string;
	isCollectionRoot: boolean;
}

function splitSegments(path: string): string[] {
	return path.split('/').filter(Boolean);
}

export function isTreeExtrasDavPath(davPath: string): boolean {
	const root = davPath.split('/').filter(Boolean)[0];

	return root !== undefined && TREE_EXTRAS_ROOTS.has(root);
}

function parseAvatarSize(segment: string): { size: number; extension: 'jpeg' | 'png' } | 'invalid' | 'missing-extension' {
	const match = /^(\d+)\.(jpeg|png)$/.exec(segment);

	if (!match) {
		return 'missing-extension';
	}

	const size = Number.parseInt(match[1], 10);

	if (!Number.isFinite(size) || size <= 0 || size > 1024) {
		return 'invalid';
	}

	return {
		size,
		extension: match[2] as 'jpeg' | 'png',
	};
}

export function parseTreeExtrasPath(parsed: ParsedDavRequest): ParsedTreeExtrasPath | null {
	const segments = splitSegments(parsed.davPath);

	if (segments.length === 0) {
		return null;
	}

	const root = segments[0];

	if (root === 'avatars') {
		const userId = segments[1];
		const sizeSegment = segments[2];

		if (!userId) {
			return {
				kind: 'avatars',
				isCollectionRoot: true,
				requestPath: buildDavHref(parsed.requestPath, true),
			};
		}

		if (!sizeSegment) {
			return {
				kind: 'avatars',
				userId,
				isCollectionRoot: false,
				requestPath: buildDavHref(parsed.requestPath, true),
			};
		}

		const avatarSize = parseAvatarSize(sizeSegment);

		if (avatarSize === 'missing-extension') {
			return {
				kind: 'avatars',
				userId,
				isCollectionRoot: false,
				requestPath: buildDavHref(parsed.requestPath, false),
			};
		}

		if (avatarSize === 'invalid') {
			return {
				kind: 'avatars',
				userId,
				avatarSize: -1,
				isCollectionRoot: false,
				requestPath: buildDavHref(parsed.requestPath, false),
			};
		}

		return {
			kind: 'avatars',
			userId,
			avatarSize: avatarSize.size,
			avatarExtension: avatarSize.extension,
			isCollectionRoot: false,
			requestPath: buildDavHref(parsed.requestPath, false),
		};
	}

	if (root === 'comments') {
		return {
			kind: 'comments',
			entityType: segments[1],
			objectId: segments[2],
			isCollectionRoot: segments.length === 1,
			requestPath: buildDavHref(parsed.requestPath, segments.length <= 2),
		};
	}

	if (root === 'systemtags') {
		return {
			kind: 'systemtags',
			tagId: segments[1],
			isCollectionRoot: segments.length === 1,
			requestPath: buildDavHref(parsed.requestPath, segments.length <= 1),
		};
	}

	if (root === 'systemtags-relations') {
		return {
			kind: 'systemtags-relations',
			entityType: segments[1],
			objectId: segments[2],
			isCollectionRoot: segments.length === 1,
			requestPath: buildDavHref(parsed.requestPath, segments.length <= 2),
		};
	}

	if (root === 'systemtags-assigned') {
		return {
			kind: 'systemtags-assigned',
			mediaType: segments[1],
			isCollectionRoot: segments.length === 1,
			requestPath: buildDavHref(parsed.requestPath, segments.length <= 1),
		};
	}

	if (root === 'provisioning') {
		const fileName = segments[1];

		if (fileName !== APPLE_CONFIG_NAME) {
			return null;
		}

		return {
			kind: 'apple-provisioning',
			isCollectionRoot: false,
			requestPath: buildDavHref(parsed.requestPath, false),
		};
	}

	return null;
}

function isAdmin(userId: string): boolean {
	return userId === getDefaultDavUserId();
}

function escapeXml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function buildCollectionPropfind(href: string, displayName: string, extraProps: Record<string, string> = {}): string {
	const extra = Object.entries(extraProps)
		.map(([key, value]) => `<${key}>${escapeXml(value)}</${key}>`)
		.join('');

	return `<?xml version="1.0" encoding="utf-8"?>`
		+ `<d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">`
		+ `<d:response>`
		+ `<d:href>${escapeXml(href)}</d:href>`
		+ `<d:propstat>`
		+ `<d:prop>`
		+ `<d:resourcetype><d:collection/></d:resourcetype>`
		+ `<d:displayname>${escapeXml(displayName)}</d:displayname>`
		+ extra
		+ `</d:prop>`
		+ `<d:status>HTTP/1.1 200 OK</d:status>`
		+ `</d:propstat>`
		+ `</d:response>`
		+ `</d:multistatus>`;
}

function buildFilePropfind(href: string, displayName: string, props: Record<string, string>): string {
	const propXml = Object.entries(props)
		.map(([key, value]) => `<${key}>${escapeXml(value)}</${key}>`)
		.join('');

	return `<?xml version="1.0" encoding="utf-8"?>`
		+ `<d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">`
		+ `<d:response>`
		+ `<d:href>${escapeXml(href)}</d:href>`
		+ `<d:propstat>`
		+ `<d:prop>`
		+ `<d:resourcetype/>`
		+ `<d:displayname>${escapeXml(displayName)}</d:displayname>`
		+ propXml
		+ `</d:prop>`
		+ `<d:status>HTTP/1.1 200 OK</d:status>`
		+ `</d:propstat>`
		+ `</d:response>`
		+ `</d:multistatus>`;
}

function systemTagPropfindEntry(tag: SystemTagRecord, href: string) {
	return {
		href,
		displayName: tag.name,
		props: {
			'oc:id': String(tag.id),
			'oc:display-name': tag.name,
			'oc:user-visible': tag.visible ? 'true' : 'false',
			'oc:user-assignable': tag.assignable ? 'true' : 'false',
			'oc:can-assign': tag.assignable ? 'true' : 'false',
			'oc:color': tag.color,
			'd:getetag': tag.etag,
		},
	};
}

function buildSystemTagPropfind(entries: Array<{ href: string; displayName: string; props: Record<string, string> }>): string {
	const parts = entries.map((entry) => {
		const propXml = Object.entries(entry.props)
			.map(([key, value]) => `<${key}>${escapeXml(value)}</${key}>`)
			.join('');

		return `<d:response>`
			+ `<d:href>${escapeXml(entry.href)}</d:href>`
			+ `<d:propstat>`
			+ `<d:prop>`
			+ `<d:resourcetype><d:collection/></d:resourcetype>`
			+ `<d:displayname>${escapeXml(entry.displayName)}</d:displayname>`
			+ propXml
			+ `</d:prop>`
			+ `<d:status>HTTP/1.1 200 OK</d:status>`
			+ `</d:propstat>`
			+ `</d:response>`;
	});

	return `<?xml version="1.0" encoding="utf-8"?>`
		+ `<d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">`
		+ parts.join('')
		+ `</d:multistatus>`;
}

export function treeExtrasNotFoundResponse(message = 'File not found'): Response {
	return new Response(buildNotFoundXml(message), {
		status: 404,
		headers: { 'content-type': 'application/xml; charset=utf-8' },
	});
}

export function treeExtrasForbiddenResponse(message = 'Forbidden'): Response {
	return new Response(buildForbiddenXml(message), {
		status: 403,
		headers: { 'content-type': 'application/xml; charset=utf-8' },
	});
}

export function treeExtrasBadRequestResponse(message: string): Response {
	return new Response(buildBadRequestXml(message), {
		status: 400,
		headers: { 'content-type': 'application/xml; charset=utf-8' },
	});
}

export function treeExtrasNotAuthenticatedResponse(): Response {
	return new Response(buildNotAuthenticatedXml('No public access to this resource.'), {
		status: 401,
		headers: {
			'content-type': 'application/xml; charset=utf-8',
			'www-authenticate': 'Basic realm="Nextcloud"',
		},
	});
}

export function treeExtrasMethodNotAllowedResponse(message: string): Response {
	return new Response(buildMethodNotAllowedXml(message), {
		status: 405,
		headers: { 'content-type': 'application/xml; charset=utf-8' },
	});
}

function requestUsesHttps(request: Request): boolean {
	const forwarded = request.headers.get('x-forwarded-proto') ?? request.headers.get('X-Forwarded-Proto');

	if (forwarded) {
		return forwarded.split(',')[0].trim().toLowerCase() === 'https';
	}

	return new URL(request.url).protocol === 'https:';
}

function buildAppleProfileXml(userId: string, host: string): string {
	return `<?xml version="1.0" encoding="UTF-8"?>`
		+ `<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">`
		+ `<plist version="1.0"><dict>`
		+ `<key>PayloadContent</key><array></array>`
		+ `<key>PayloadDisplayName</key><string>Nextcloud</string>`
		+ `<key>PayloadIdentifier</key><string>${escapeXml(host)}.profile</string>`
		+ `<key>PayloadType</key><string>Configuration</string>`
		+ `<key>PayloadUUID</key><string>parity-profile</string>`
		+ `<key>PayloadVersion</key><integer>1</integer>`
		+ `<key>CalDAVUsername</key><string>${escapeXml(userId)}</string>`
		+ `</dict></plist>`;
}

function handleAvatarsGet(path: ParsedTreeExtrasPath): Response {
	if (!path.userId || path.avatarSize === undefined) {
		return treeExtrasNotFoundResponse();
	}

	if (path.avatarSize === -1) {
		return treeExtrasMethodNotAllowedResponse('Invalid avatar size');
	}

	if (!path.avatarExtension) {
		return treeExtrasMethodNotAllowedResponse('Avatar file must end with .jpeg or .png');
	}

	const bytes = getAvatarFixture(path.userId, path.avatarSize);

	if (!bytes) {
		return treeExtrasNotFoundResponse(`Avatar not found for user ${path.userId}`);
	}

	return new Response(new Uint8Array(bytes), {
		status: 200,
		headers: {
			'content-type': 'image/png',
			'content-length': String(bytes.length),
		},
	});
}

function handleAvatarsPropfind(path: ParsedTreeExtrasPath, depth: number): Response {
	if (!path.userId) {
		return new Response(buildCollectionPropfind(path.requestPath, 'avatars'), {
			status: 207,
			headers: { 'content-type': 'application/xml; charset=utf-8' },
		});
	}

	if (path.avatarSize === -1) {
		return treeExtrasMethodNotAllowedResponse('Invalid avatar size');
	}

	if (path.avatarSize !== undefined && path.avatarExtension) {
		const bytes = getAvatarFixture(path.userId, path.avatarSize);

		if (!bytes) {
			return treeExtrasNotFoundResponse(`Avatar not found for user ${path.userId}`);
		}

		return new Response(buildFilePropfind(path.requestPath, `${path.avatarSize}.${path.avatarExtension}`, {
			'd:getcontentlength': String(bytes.length),
			'd:getcontenttype': 'image/png',
		}), {
			status: 207,
			headers: { 'content-type': 'application/xml; charset=utf-8' },
		});
	}

	const children = getAvatarFixture(path.userId, 96)
		? [`${path.requestPath.replace(/\/?$/, '')}/96.png`]
		: [];
	const responses: Array<{ href: string; displayName: string; props: Record<string, string> }> = [{
		href: path.requestPath,
		displayName: path.userId,
		props: {
			'd:getetag': '"avatar-home"',
		},
	}];

	if (depth >= 1) {
		for (const childHref of children) {
			responses.push({
				href: childHref,
				displayName: '96.png',
				props: {
					'd:getcontentlength': '67',
					'd:getcontenttype': 'image/png',
				},
			});
		}
	}

	return new Response(buildSystemTagPropfind(responses), {
		status: 207,
		headers: { 'content-type': 'application/xml; charset=utf-8' },
	});
}

function handleCommentsPropfind(path: ParsedTreeExtrasPath, userId: string, depth: number): Response | 'not-authenticated' {
	if (path.isCollectionRoot) {
		const children = [...COMMENT_ENTITY_TYPES].map((entity) => ({
			href: buildDavHref(`/remote.php/dav/comments/${entity}/`, true),
			displayName: entity,
			props: {
				'd:getetag': '"comments-root"',
			},
		}));

		return new Response(buildSystemTagPropfind([{
			href: path.requestPath,
			displayName: 'comments',
			props: { 'd:getetag': '"comments"' },
		}, ...(depth >= 1 ? children : [])]), {
			status: 207,
			headers: { 'content-type': 'application/xml; charset=utf-8' },
		});
	}

	if (!path.entityType || !isCommentEntityType(path.entityType)) {
		return treeExtrasNotFoundResponse(`Entity type "${path.entityType ?? ''}" not found."`);
	}

	if (!path.objectId) {
		return new Response(buildCollectionPropfind(path.requestPath, path.entityType), {
			status: 207,
			headers: { 'content-type': 'application/xml; charset=utf-8' },
		});
	}

	if (!fileExistsInUserHome(userId, path.objectId)) {
		return treeExtrasNotFoundResponse(`Entity with id ${path.objectId} not found`);
	}

	return new Response(buildCollectionPropfind(path.requestPath, path.objectId), {
		status: 207,
		headers: { 'content-type': 'application/xml; charset=utf-8' },
	});
}

function handleSystemTagsPropfind(path: ParsedTreeExtrasPath, userId: string, depth: number): Response {
	if (path.isCollectionRoot) {
		const tags = listSystemTags(userId, isAdmin(userId));
		const responses = [{
			...systemTagPropfindEntry({
				id: 0,
				name: 'systemtags',
				visible: true,
				assignable: false,
				etag: '"systemtags"',
				color: '',
			}, path.requestPath),
		}];

		if (depth >= 1) {
			for (const tag of tags) {
				responses.push(systemTagPropfindEntry(tag, buildDavHref(`/remote.php/dav/systemtags/${tag.id}/`, true)));
			}
		}

		return new Response(buildSystemTagPropfind(responses), {
			status: 207,
			headers: { 'content-type': 'application/xml; charset=utf-8' },
		});
	}

	if (!path.tagId) {
		return treeExtrasNotFoundResponse();
	}

	const tag = getSystemTagById(path.tagId, userId, isAdmin(userId));

	if (tag === 'bad-request') {
		return treeExtrasBadRequestResponse('Invalid tag id');
	}

	if (tag === 'not-found') {
		return treeExtrasNotFoundResponse(`Tag with id ${path.tagId} not found`);
	}

	return new Response(buildSystemTagPropfind([systemTagPropfindEntry(tag, path.requestPath)]), {
		status: 207,
		headers: { 'content-type': 'application/xml; charset=utf-8' },
	});
}

function handleSystemTagsRelationsPropfind(path: ParsedTreeExtrasPath, userId: string, depth: number): Response {
	if (path.isCollectionRoot) {
		const children = [{
			href: buildDavHref('/remote.php/dav/systemtags-relations/files/', true),
			displayName: 'files',
			props: { 'd:getetag': '"files"' },
		}];

		return new Response(buildSystemTagPropfind([{
			href: path.requestPath,
			displayName: 'systemtags-relations',
			props: { 'd:getetag': '"systemtags-relations"' },
		}, ...(depth >= 1 ? children : [])]), {
			status: 207,
			headers: { 'content-type': 'application/xml; charset=utf-8' },
		});
	}

	if (!path.entityType || path.entityType !== 'files') {
		return treeExtrasNotFoundResponse(`Type "${path.entityType ?? ''}" not found`);
	}

	if (!path.objectId) {
		return new Response(buildCollectionPropfind(path.requestPath, 'files'), {
			status: 207,
			headers: { 'content-type': 'application/xml; charset=utf-8' },
		});
	}

	if (!fileExistsInUserHome(userId, path.objectId)) {
		return treeExtrasNotFoundResponse(`Object with id ${path.objectId} not found`);
	}

	const tags = listTagsForObject(path.entityType, path.objectId, userId);

	if (tags === 'not-found') {
		return treeExtrasNotFoundResponse(`Object with id ${path.objectId} not found`);
	}

	const responses = [{
		href: path.requestPath,
		displayName: path.objectId,
		props: { 'd:getetag': `"relations-${path.objectId}"` },
	}];

	if (depth >= 1) {
		for (const tag of tags) {
			responses.push(systemTagPropfindEntry(tag, buildDavHref(`/remote.php/dav/systemtags/${tag.id}/`, true)));
		}
	}

	return new Response(buildSystemTagPropfind(responses), {
		status: 207,
		headers: { 'content-type': 'application/xml; charset=utf-8' },
	});
}

function handleSystemTagsAssignedPropfind(path: ParsedTreeExtrasPath, userId: string): Response {
	if (!userHasFilesFolder(userId)) {
		return treeExtrasForbiddenResponse('Permission denied to read this collection');
	}

	if (path.mediaType) {
		const childPath = parseTreeExtrasPath({
			ingress: 'v2',
			davPath: `systemtags-assigned/${path.mediaType}`,
			requestPath: `/remote.php/dav/systemtags-assigned/${path.mediaType}/`,
		});

		if (!childPath) {
			return treeExtrasNotFoundResponse('Invalid media type');
		}

		const tags = listAssignedTags(userId, path.mediaType);
		const responses = tags.map((tag) => systemTagPropfindEntry(
			tag,
			buildDavHref(`/remote.php/dav/systemtags-assigned/${path.mediaType}/${tag.id}/`, true),
		));

		return new Response(buildSystemTagPropfind([{
			href: childPath.requestPath,
			displayName: path.mediaType,
			props: { 'd:getetag': `"assigned-${path.mediaType}"` },
		}, ...responses]), {
			status: 207,
			headers: { 'content-type': 'application/xml; charset=utf-8' },
		});
	}

	const tags = listAssignedTags(userId);
	const responses = tags.map((tag) => systemTagPropfindEntry(
		tag,
		buildDavHref(`/remote.php/dav/systemtags-assigned/${tag.id}/`, true),
	));

	return new Response(buildSystemTagPropfind([{
		href: path.requestPath,
		displayName: 'systemtags-assigned',
		props: { 'd:getetag': '"systemtags-assigned"' },
	}, ...responses]), {
		status: 207,
		headers: { 'content-type': 'application/xml; charset=utf-8' },
	});
}

function handleAppleProvisioningPropfind(path: ParsedTreeExtrasPath): Response {
	return new Response(buildFilePropfind(path.requestPath, APPLE_CONFIG_NAME, {
		'd:getcontentlength': '42',
	}), {
		status: 207,
		headers: { 'content-type': 'application/xml; charset=utf-8' },
	});
}

function handleAppleProvisioningGet(request: Request, path: ParsedTreeExtrasPath, userId: string): Response {
	if (!requestUsesHttps(request)) {
		return new Response('Your Nextcloud needs to be configured to use HTTPS in order to use CalDAV and CardDAV with iOS/macOS.', {
			status: 200,
			headers: { 'content-type': 'text/plain; charset=utf-8' },
		});
	}

	const host = new URL(request.url).hostname;
	const body = buildAppleProfileXml(userId, host);
	const filename = `${userId}-${APPLE_CONFIG_NAME}`;

	return new Response(body, {
		status: 200,
		headers: {
			'content-type': 'application/xml; charset=utf-8',
			'content-disposition': `attachment; filename="${filename}"`,
		},
	});
}

export function handleTreeExtrasPropfind(
	request: Request,
	parsed: ParsedDavRequest,
	userId: string | null,
): Response {
	const path = parseTreeExtrasPath(parsed);

	if (!path) {
		return treeExtrasNotFoundResponse();
	}

	if (!userId) {
		if (path.kind === 'comments' || path.kind === 'systemtags-assigned') {
			return treeExtrasNotAuthenticatedResponse();
		}

		return treeExtrasNotAuthenticatedResponse();
	}

	const depthHeader = request.headers.get('depth') ?? request.headers.get('Depth');
	const depth = parseDepthHeader(depthHeader);

	switch (path.kind) {
		case 'avatars':
			return handleAvatarsPropfind(path, depth);
		case 'comments': {
			const result = handleCommentsPropfind(path, userId, depth);

			if (result === 'not-authenticated') {
				return treeExtrasNotAuthenticatedResponse();
			}

			return result;
		}
		case 'systemtags':
			return handleSystemTagsPropfind(path, userId, depth);
		case 'systemtags-relations':
			return handleSystemTagsRelationsPropfind(path, userId, depth);
		case 'systemtags-assigned':
			return handleSystemTagsAssignedPropfind(path, userId);
		case 'apple-provisioning':
			return handleAppleProvisioningPropfind(path);
	}
}

export function handleTreeExtrasGet(
	request: Request,
	parsed: ParsedDavRequest,
	userId: string | null,
): Response {
	const path = parseTreeExtrasPath(parsed);

	if (!path) {
		return treeExtrasNotFoundResponse();
	}

	if (!userId) {
		return treeExtrasNotAuthenticatedResponse();
	}

	switch (path.kind) {
		case 'avatars':
			return handleAvatarsGet(path);
		case 'apple-provisioning':
			return handleAppleProvisioningGet(request, path, userId);
		default:
			return treeExtrasMethodNotAllowedResponse('GET is not allowed on this collection');
	}
}

export function handleTreeExtrasWrite(
	request: Request,
	parsed: ParsedDavRequest,
	userId: string | null,
): Response {
	const path = parseTreeExtrasPath(parsed);

	if (!path) {
		return treeExtrasNotFoundResponse();
	}

	if (!userId) {
		return treeExtrasNotAuthenticatedResponse();
	}

	const method = request.method.toUpperCase();

	if (path.kind === 'apple-provisioning' && (method === 'DELETE' || method === 'PROPPATCH')) {
		return treeExtrasForbiddenResponse(`${APPLE_CONFIG_NAME}'s properties may not be altered.`);
	}

	if (path.kind === 'comments' && path.isCollectionRoot && (method === 'MKCOL' || method === 'PUT')) {
		return treeExtrasForbiddenResponse('Permission denied to create collections');
	}

	if (path.kind === 'systemtags' && method === 'PUT') {
		return treeExtrasForbiddenResponse('Cannot create tags by id');
	}

	if (method === 'REPORT') {
		return treeExtrasMethodNotAllowedResponse('REPORT is not supported on this collection');
	}

	return treeExtrasMethodNotAllowedResponse('Method not allowed');
}

export async function handleTreeExtrasRequest(
	request: Request,
	parsed: ParsedDavRequest,
	userId: string | null,
): Promise<Response> {
	const method = request.method.toUpperCase();

	if (method === 'OPTIONS') {
		return new Response(null, {
			status: 200,
			headers: {
				allow: 'OPTIONS, GET, HEAD, PROPFIND, PUT, REPORT',
				dav: '1, 3, extended-mkcol',
				'content-length': '0',
			},
		});
	}

	if (method === 'PROPFIND') {
		return handleTreeExtrasPropfind(request, parsed, userId);
	}

	if (method === 'GET' || method === 'HEAD') {
		const response = handleTreeExtrasGet(request, parsed, userId);

		if (method === 'HEAD' && response.status === 200) {
			const headers = new Headers(response.headers);

			return new Response(null, { status: response.status, headers });
		}

		return response;
	}

	if (method === 'PUT' || method === 'MKCOL' || method === 'DELETE' || method === 'PROPPATCH' || method === 'REPORT') {
		return handleTreeExtrasWrite(request, parsed, userId);
	}

	return treeExtrasMethodNotAllowedResponse('Method not allowed');
}
