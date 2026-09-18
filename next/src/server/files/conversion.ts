import path from 'node:path';
import { findNodeWithPathByFileId } from '@/src/server/dav/files';
import {
	assembleFileIntoHome,
	ensureDirectoryInHome,
	getAdminFilesHome,
	getDefaultDavUserId,
} from '@/src/server/dav/store';
import type { DavFileNode } from '@/src/server/dav/types';
import {
	findConversionMapping,
	isConversionProviderEnabled,
} from './conversion-store';
import { requireTemplatesOcsUser } from './templates-auth';
import {
	ocsCreatedResponse,
	ocsFailureResponse,
	ocsForbiddenResponse,
	parseOcsVersion,
} from '@/src/server/ocs/respond';

const MAX_FILE_SIZE_MIB = 100;
const CONVERT_FAILED = 'The file could not be converted.';
const FILE_NOT_FOUND = 'The file cannot be found';
const FILE_TOO_LARGE = 'File is too large to convert';
const EXTENSION_MISMATCH = 'Destination does not match conversion extension';

function findNodeByRelativePath(relativePath: string): DavFileNode | null {
	const segments = relativePath.replace(/^\/+/, '').split('/').filter(Boolean);

	if (segments.length === 0) {
		return getAdminFilesHome();
	}

	let current = getAdminFilesHome();

	for (const segment of segments) {
		if (current.kind !== 'directory') {
			return null;
		}

		const child = current.children?.find((entry) => entry.name === segment);

		if (!child) {
			return null;
		}

		current = child;
	}

	return current;
}

function getNonExistingName(parent: DavFileNode, fileName: string): string {
	const extension = path.posix.extname(fileName);
	const baseName = extension ? fileName.slice(0, -extension.length) : fileName;
	let candidate = fileName;
	let counter = 2;

	while (parent.children?.some((entry) => entry.name === candidate)) {
		candidate = extension
			? `${baseName} (${counter})${extension}`
			: `${fileName} (${counter})`;
		counter += 1;
	}

	return candidate;
}

function stubConvertedContent(): Buffer {
	return Buffer.from([
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
		0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
	]);
}

export async function handleConversionConvert(request: Request): Promise<Response> {
	const ocsVersion = parseOcsVersion(request);
	const body = await request.json().catch(() => null) as {
		fileId?: number;
		targetMimeType?: string;
		destination?: string | null;
	} | null;
	const auth = requireTemplatesOcsUser(request, body ?? undefined);

	if (auth instanceof Response) {
		return auth;
	}

	if (auth !== getDefaultDavUserId()) {
		return ocsFailureResponse(ocsVersion, 404, FILE_NOT_FOUND, []);
	}

	if (!body?.fileId || !body.targetMimeType) {
		return new Response(null, { status: 400 });
	}

	const located = findNodeWithPathByFileId(auth, body.fileId);
	const file = located?.node;

	if (!file || file.kind !== 'file') {
		return ocsFailureResponse(ocsVersion, 404, FILE_NOT_FOUND, []);
	}

	if (!isConversionProviderEnabled()) {
		return ocsFailureResponse(ocsVersion, 500, CONVERT_FAILED, []);
	}

	const mapping = findConversionMapping(file.contentType, body.targetMimeType);

	if (!mapping) {
		return ocsFailureResponse(ocsVersion, 500, CONVERT_FAILED, []);
	}

	const fileSizeMib = file.size / (1024 * 1024);

	if (fileSizeMib > MAX_FILE_SIZE_MIB) {
		return ocsFailureResponse(ocsVersion, 400, FILE_TOO_LARGE, []);
	}

	let destination = body.destination ?? null;

	if (destination !== null) {
		destination = destination.replace(/\/+/g, '/').replace(/^\/+/, '');
		const parentPath = path.posix.dirname(destination);
		const parent = parentPath === '.' ? getAdminFilesHome() : findNodeByRelativePath(parentPath);

		if (!parent || parent.kind !== 'directory') {
			return ocsFailureResponse(
				ocsVersion,
				404,
				`The destination path does not exist: ${parentPath}`,
				[],
			);
		}

		if (path.posix.extname(destination).slice(1) !== mapping.extension) {
			return ocsFailureResponse(ocsVersion, 400, EXTENSION_MISMATCH, []);
		}
	} else {
		const parentPath = located.path.includes('/')
			? located.path.slice(0, located.path.lastIndexOf('/'))
			: '';
		const baseName = path.posix.basename(file.name, path.posix.extname(file.name));
		destination = parentPath ? `${parentPath}/${baseName}.${mapping.extension}` : `${baseName}.${mapping.extension}`;
	}

	if (path.posix.extname(destination).slice(1) !== mapping.extension) {
		return ocsFailureResponse(ocsVersion, 400, EXTENSION_MISMATCH, []);
	}

	const parentPath = path.posix.dirname(destination);
	const parent = parentPath === '.' || parentPath === ''
		? getAdminFilesHome()
		: findNodeByRelativePath(parentPath);

	if (!parent || parent.kind !== 'directory') {
		return ocsForbiddenResponse(ocsVersion, 'Destination does not exist', []);
	}

	const fileName = path.posix.basename(destination);
	const finalName = parent.children?.some((entry) => entry.name === fileName)
		? getNonExistingName(parent, fileName)
		: fileName;
	const finalDestination = parentPath === '.' || parentPath === ''
		? finalName
		: `${parentPath}/${finalName}`;

	if (parentPath !== '.' && parentPath !== '') {
		ensureDirectoryInHome(parentPath);
	}

	assembleFileIntoHome(finalDestination, stubConvertedContent());
	const converted = findNodeByRelativePath(finalDestination);

	if (!converted || converted.kind !== 'file') {
		return ocsFailureResponse(ocsVersion, 500, CONVERT_FAILED, []);
	}

	return ocsCreatedResponse({
		path: finalDestination,
		fileId: converted.fileId,
	}, ocsVersion);
}
