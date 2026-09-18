import { getPreviewFixture } from '@/src/server/fixtures/binary';
import { binaryResponse, cacheForSeconds, jsonArrayResponse } from '@/src/server/http/binary';
import { getPreviewFileById, getPreviewFileByPath } from '@/src/server/preview/catalog';

const MIME_ICON_PATHS: Record<string, string> = {
	'image/png': '/core/img/filetypes/image-png.svg',
	'application/pdf': '/core/img/filetypes/application-pdf.svg',
	'application/octet-stream': '/core/img/filetypes/application.svg',
};

export function getMimeIconRedirect(mime: string, origin: string): Response {
	const normalizedMime = mime.trim() || 'application/octet-stream';
	const iconPath = MIME_ICON_PATHS[normalizedMime]
		?? MIME_ICON_PATHS['application/octet-stream'];

	return new Response(null, {
		status: 303,
		headers: {
			location: `${origin}${iconPath}`,
		},
	});
}

export function getPreviewByFileIdResponse(
	fileId: number,
	x: number,
	y: number,
	origin: string,
	mimeFallback = false,
): Response {
	if (x === 0 || y === 0) {
		return jsonArrayResponse(400);
	}

	const file = getPreviewFileById(fileId);

	if (!file || !file.readable) {
		return jsonArrayResponse(404);
	}

	return buildPreviewResponse(file.mime, origin, mimeFallback);
}

export function getPreviewByPathResponse(
	filePath: string,
	x: number,
	y: number,
	origin: string,
	mimeFallback = false,
): Response {
	if (!filePath || x === 0 || y === 0) {
		return jsonArrayResponse(400);
	}

	const file = getPreviewFileByPath(filePath);

	if (!file || !file.readable) {
		return jsonArrayResponse(404);
	}

	return buildPreviewResponse(file.mime, origin, mimeFallback);
}

function buildPreviewResponse(mime: string, origin: string, mimeFallback: boolean): Response {
	if (mime.startsWith('image/')) {
		const bytes = getPreviewFixture();
		const response = binaryResponse(bytes, 200, mime);

		return cacheForSeconds(response, 3600 * 24);
	}

	if (mimeFallback) {
		return getMimeIconRedirect(mime, origin);
	}

	return jsonArrayResponse(404);
}
