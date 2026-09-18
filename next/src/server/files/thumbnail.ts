import { getAdminFilesHome, getDefaultDavUserId } from '@/src/server/dav/store';
import type { DavFileNode } from '@/src/server/dav/types';
import { getPreviewFixture } from '@/src/server/fixtures/binary';
import { binaryResponse } from '@/src/server/http/binary';

const JSON_HEADERS = {
	'content-type': 'application/json; charset=utf-8',
};

function badSizeResponse(): Response {
	return new Response(JSON.stringify({ message: 'Requested size must be numeric and a positive value.' }), {
		status: 400,
		headers: JSON_HEADERS,
	});
}

function notFoundResponse(): Response {
	return new Response(JSON.stringify({ message: 'File not found.' }), {
		status: 404,
		headers: JSON_HEADERS,
	});
}

function previewFailureResponse(): Response {
	return new Response('[]', {
		status: 400,
		headers: JSON_HEADERS,
	});
}

function normalizeRelativePath(path: string): string {
	return path.replace(/^\/+/, '');
}

function resolveFileNode(relativePath: string): DavFileNode | null {
	const segments = normalizeRelativePath(relativePath).split('/').filter(Boolean);

	if (segments.length === 0) {
		return null;
	}

	let current: DavFileNode = getAdminFilesHome();

	for (let index = 0; index < segments.length; index += 1) {
		const segment = segments[index];
		const child = current.children?.find((entry) => entry.name === segment);

		if (!child) {
			return null;
		}

		if (index === segments.length - 1) {
			return child;
		}

		if (child.kind !== 'directory') {
			return null;
		}

		current = child;
	}

	return null;
}

function canGeneratePreview(node: DavFileNode): boolean {
	if (node.kind !== 'file') {
		return false;
	}

	return node.contentType.startsWith('text/') || node.contentType.startsWith('image/');
}

function parsePositiveDimension(value: string): number {
	const parsed = Number(value);

	if (!Number.isFinite(parsed) || parsed < 1) {
		return 0;
	}

	return parsed;
}

export function getThumbnailResponse(userId: string, xRaw: string, yRaw: string, filePath: string): Response {
	const x = parsePositiveDimension(xRaw);
	const y = parsePositiveDimension(yRaw);

	if (x < 1 || y < 1) {
		return badSizeResponse();
	}

	if (userId !== getDefaultDavUserId()) {
		return notFoundResponse();
	}

	const node = resolveFileNode(filePath);

	if (!node || node.kind !== 'file' || node.fileId <= 0) {
		return notFoundResponse();
	}

	try {
		if (!canGeneratePreview(node)) {
			throw new Error('Preview not available');
		}

		const bytes = getPreviewFixture();

		return binaryResponse(bytes, 200, 'image/png');
	} catch {
		return previewFailureResponse();
	}
}
