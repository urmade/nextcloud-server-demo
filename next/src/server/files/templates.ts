import { findNodeWithPathByFileId } from '@/src/server/dav/files';
import {
	assembleFileIntoHome,
	ensureDirectoryInHome,
	getAdminFilesHome,
	getDefaultDavUserId,
} from '@/src/server/dav/store';
import type { DavFileNode } from '@/src/server/dav/types';
import {
	ocsForbiddenResponse,
	ocsSuccessResponse,
	parseOcsVersion,
} from '@/src/server/ocs/respond';
import {
	getTemplateDirectoryPath,
	getTemplateFields,
	listTemplateCreators,
	listTemplatesWithNested,
	setTemplateDirectoryPath,
	type TemplateFile,
} from './template-store';
import { requireTemplatesOcsUser, requireTemplatesOcsUserGet } from './templates-auth';

const PERMISSION_ALL = 31;
const FILE_ALREADY_EXISTS = 'File already exists';
const CREATE_FAILED = 'Failed to create file from template';

function parseJsonBody<T>(request: Request): Promise<T | null> {
	return request.json().catch(() => null);
}

function normalizeRelativePath(filePath: string): string {
	return filePath.replace(/^\/+/, '');
}

function findNodeByRelativePath(userId: string, filePath: string): { node: DavFileNode; path: string } | null {
	if (userId !== getDefaultDavUserId()) {
		return null;
	}

	const segments = normalizeRelativePath(filePath).split('/').filter(Boolean);

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
	const segments = normalizeRelativePath(filePath).split('/').filter(Boolean);

	if (segments.length === 0) {
		return false;
	}

	if (segments.length === 1) {
		return true;
	}

	return findNodeByRelativePath(userId, segments.slice(0, -1).join('/')) !== null;
}

function hasFilePreview(node: DavFileNode): boolean {
	return node.contentType.startsWith('text/') || node.contentType.startsWith('image/');
}

function formatTemplateFile(node: DavFileNode, relativePath: string): TemplateFile {
	return {
		basename: node.name,
		etag: node.etag,
		fileid: node.fileId,
		filename: relativePath,
		lastmod: node.mtime ?? 0,
		mime: node.contentType,
		size: node.size,
		type: 'file',
		hasPreview: hasFilePreview(node),
		permissions: PERMISSION_ALL,
	};
}

function normalizeTemplateDirectoryPath(templatePath: string): string {
	const trimmed = templatePath.trim().replace(/^\/+/, '').replace(/\/+$/, '');

	if (!trimmed) {
		return '';
	}

	return `${trimmed}/`;
}

function initializeTemplateDirectory(templatePath: string, copySystemTemplates: boolean): string {
	try {
		const normalizedPath = normalizeTemplateDirectoryPath(templatePath);

		if (normalizedPath && !copySystemTemplates) {
			ensureDirectoryInHome(normalizedPath);
		}

		setTemplateDirectoryPath(normalizedPath);

		return normalizedPath;
	} catch {
		setTemplateDirectoryPath('');

		return '';
	}
}

export function handleTemplateList(request: Request): Response {
	const ocsVersion = parseOcsVersion(request);
	const auth = requireTemplatesOcsUserGet(request);

	if (auth instanceof Response) {
		return auth;
	}

	return ocsSuccessResponse(listTemplatesWithNested(), ocsVersion);
}

export function handleTemplateListFields(request: Request, fileId: number): Response {
	const ocsVersion = parseOcsVersion(request);
	const auth = requireTemplatesOcsUserGet(request);

	if (auth instanceof Response) {
		return auth;
	}

	const fields = getTemplateFields(fileId);

	if (fields.length === 0 && findNodeWithPathByFileId(auth, fileId) === null) {
		return ocsSuccessResponse([], ocsVersion);
	}

	return ocsSuccessResponse(fields, ocsVersion);
}

export async function handleTemplateCreate(request: Request): Promise<Response> {
	const ocsVersion = parseOcsVersion(request);
	const body = await parseJsonBody<{
		filePath?: string;
		templatePath?: string;
		templateType?: string;
		templateFields?: unknown[];
	}>(request);
	const auth = requireTemplatesOcsUser(request, body ?? undefined);

	if (auth instanceof Response) {
		return auth;
	}

	if (!body?.filePath) {
		return ocsForbiddenResponse(ocsVersion, CREATE_FAILED, []);
	}

	const relativePath = normalizeRelativePath(body.filePath);

	if (findNodeByRelativePath(auth, relativePath)) {
		return ocsForbiddenResponse(ocsVersion, FILE_ALREADY_EXISTS, []);
	}

	if (!parentPathExists(auth, relativePath)) {
		return ocsForbiddenResponse(ocsVersion, CREATE_FAILED, []);
	}

	try {
		const { created } = assembleFileIntoHome(relativePath, Buffer.alloc(0));

		if (!created) {
			return ocsForbiddenResponse(ocsVersion, FILE_ALREADY_EXISTS, []);
		}

		const located = findNodeByRelativePath(auth, relativePath);

		if (!located || located.node.kind !== 'file') {
			return ocsForbiddenResponse(ocsVersion, CREATE_FAILED, []);
		}

		return ocsSuccessResponse(formatTemplateFile(located.node, relativePath), ocsVersion);
	} catch {
		return ocsForbiddenResponse(ocsVersion, CREATE_FAILED, []);
	}
}

export async function handleTemplatePath(request: Request): Promise<Response> {
	const ocsVersion = parseOcsVersion(request);
	const body = await parseJsonBody<{
		templatePath?: string;
		copySystemTemplates?: boolean;
	}>(request);
	const auth = requireTemplatesOcsUser(request, body ?? undefined);

	if (auth instanceof Response) {
		return auth;
	}

	const templatePath = body?.templatePath ?? '';
	const copySystemTemplates = body?.copySystemTemplates ?? false;
	const initializedPath = initializeTemplateDirectory(templatePath, copySystemTemplates);

	return ocsSuccessResponse({
		template_path: initializedPath || getTemplateDirectoryPath(),
		templates: listTemplateCreators(),
	}, ocsVersion);
}
