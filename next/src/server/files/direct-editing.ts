import { findNodeWithPathByFileId } from '@/src/server/dav/files';
import { assembleFileIntoHome, getAdminFilesHome, getDefaultDavUserId } from '@/src/server/dav/store';
import type { DavFileNode } from '@/src/server/dav/types';
import { requireAuthenticatedUser } from '@/src/server/ocs/auth';
import {
	ocsFailureResponse,
	ocsSuccessResponse,
	parseOcsVersion,
} from '@/src/server/ocs/respond';
import {
	getCreator,
	getDirectEditingCapabilities,
	getDirectEditingETag,
	getDirectEditingTemplates,
	getEditor,
	isDirectEditingEnabled,
	mintDirectEditToken,
} from './direct-editing-store';

function getRequestOrigin(request: Request): string {
	const forwardedHost = request.headers.get('x-forwarded-host');
	const host = forwardedHost ?? request.headers.get('host') ?? '127.0.0.1:3100';
	const proto = request.headers.get('x-forwarded-proto') ?? 'http';

	return `${proto}://${host}`;
}

function buildDirectEditingUrl(request: Request, token: string): string {
	return `${getRequestOrigin(request)}/index.php/apps/files/directEditing/${token}`;
}

function findNodeByRelativePath(userId: string, filePath: string): { node: DavFileNode; path: string } | null {
	if (userId !== getDefaultDavUserId()) {
		return null;
	}

	const segments = filePath.replace(/^\/+/, '').split('/').filter(Boolean);

	if (segments.length === 0) {
		return null;
	}

	let current = getAdminFilesHome();
	let currentPath = '';

	for (const segment of segments) {
		if (current.kind !== 'directory') {
			return null;
		}

		const child = current.children?.find((entry) => entry.name === segment);

		if (!child) {
			return null;
		}

		current = child;
		currentPath = currentPath ? `${currentPath}/${segment}` : segment;
	}

	return { node: current, path: currentPath };
}

function parentPathExists(userId: string, filePath: string): boolean {
	const segments = filePath.replace(/^\/+/, '').split('/').filter(Boolean);

	if (segments.length === 0) {
		return false;
	}

	if (segments.length === 1) {
		return true;
	}

	return findNodeByRelativePath(userId, segments.slice(0, -1).join('/')) !== null;
}

function findEditorForFile(file: DavFileNode): string | null {
	const capabilities = getDirectEditingCapabilities();

	for (const editor of Object.values(capabilities.editors)) {
		if (editor.mimetypes.includes(file.contentType)) {
			return editor.id;
		}
	}

	return null;
}

function parseJsonBody<T>(request: Request): Promise<T | null> {
	return request.json().catch(() => null);
}

export function handleDirectEditingInfo(request: Request): Response {
	const ocsVersion = parseOcsVersion(request);
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const capabilities = getDirectEditingCapabilities();
	const response = ocsSuccessResponse(capabilities, ocsVersion);

	response.headers.set('etag', getDirectEditingETag());

	return response;
}

export function handleDirectEditingTemplates(
	request: Request,
	editorId: string,
	creatorId: string,
): Response {
	const ocsVersion = parseOcsVersion(request);
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	if (!isDirectEditingEnabled()) {
		return ocsFailureResponse(ocsVersion, 500, 'Direct editing is not enabled', {
			message: 'Direct editing is not enabled',
		});
	}

	try {
		return ocsSuccessResponse({ templates: getDirectEditingTemplates(editorId, creatorId) }, ocsVersion);
	} catch (error) {
		const message = error instanceof Error
			? `Failed to obtain template list: ${error.message}`
			: 'Failed to obtain template list';

		return ocsFailureResponse(ocsVersion, 500, message, { message });
	}
}

export async function handleDirectEditingOpen(request: Request): Promise<Response> {
	const ocsVersion = parseOcsVersion(request);
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	if (!isDirectEditingEnabled()) {
		return ocsFailureResponse(ocsVersion, 500, 'Direct editing is not enabled', {
			message: 'Direct editing is not enabled',
		});
	}

	const body = await parseJsonBody<{
		path?: string;
		editorId?: string | null;
		fileId?: number | null;
	}>(request);

	if (!body?.path) {
		return ocsFailureResponse(ocsVersion, 403, 'Failed to open file: Invalid path', {
			message: 'Failed to open file: Invalid path',
		});
	}

	try {
		let located = findNodeByRelativePath(auth, body.path);

		if (!located) {
			throw new Error('File not found');
		}

		if (body.fileId != null && located.node.kind === 'directory') {
			const byId = findNodeWithPathByFileId(auth, body.fileId);

			if (!byId || byId.node.kind !== 'file') {
				throw new Error('File not found');
			}

			located = byId;
		}

		if (located.node.kind !== 'file') {
			throw new Error('No default editor found for files mimetype');
		}

		const editorId = body.editorId ?? findEditorForFile(located.node);

		if (!editorId || !getEditor(editorId)) {
			throw new Error(`Editor ${body.editorId ?? 'default'} is unknown`);
		}

		const token = mintDirectEditToken(auth, editorId, located.node.fileId);

		return ocsSuccessResponse({ url: buildDirectEditingUrl(request, token) }, ocsVersion);
	} catch (error) {
		const message = error instanceof Error ? `Failed to open file: ${error.message}` : 'Failed to open file';

		return ocsFailureResponse(ocsVersion, 403, message, { message });
	}
}

export async function handleDirectEditingCreate(request: Request): Promise<Response> {
	const ocsVersion = parseOcsVersion(request);
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	if (!isDirectEditingEnabled()) {
		return ocsFailureResponse(ocsVersion, 500, 'Direct editing is not enabled', {
			message: 'Direct editing is not enabled',
		});
	}

	const body = await parseJsonBody<{
		path?: string;
		editorId?: string;
		creatorId?: string;
		templateId?: string | null;
	}>(request);

	if (!body?.path || !body.editorId || !body.creatorId) {
		return ocsFailureResponse(ocsVersion, 403, 'Failed to create file: Invalid request', {
			message: 'Failed to create file: Invalid request',
		});
	}

	try {
		if (!getEditor(body.editorId)) {
			throw new Error('No editor found');
		}

		const creator = getCreator(body.editorId, body.creatorId);

		if (!creator) {
			throw new Error('No creator found');
		}

		if (findNodeByRelativePath(auth, body.path)) {
			throw new Error('File already exists');
		}

		if (!parentPathExists(auth, body.path)) {
			throw new Error('Invalid path');
		}

		const { created } = assembleFileIntoHome(body.path, Buffer.from(''));

		if (!created) {
			throw new Error('File already exists');
		}

		const located = findNodeByRelativePath(auth, body.path);

		if (!located || located.node.kind !== 'file') {
			throw new Error('Failed to create file');
		}

		located.node.contentType = creator.mimetype;
		const token = mintDirectEditToken(auth, body.editorId, located.node.fileId);

		return ocsSuccessResponse({ url: buildDirectEditingUrl(request, token) }, ocsVersion);
	} catch (error) {
		const message = error instanceof Error ? `Failed to create file: ${error.message}` : 'Failed to create file';

		return ocsFailureResponse(ocsVersion, 403, message, { message });
	}
}
