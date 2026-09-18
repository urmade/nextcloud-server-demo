import {
	handleDirectEditingView,
	handleFilesViewIndex,
	handleShowFile,
} from '@/src/server/files/view';
import { snapshotResponse } from '../compare';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';

const FILES_INDEX_PATH = /^\/(?:index\.php\/)?apps\/files\/?$/;
const FILES_VIEW_PATH = /^\/(?:index\.php\/)?apps\/files\/([^/]+)\/?$/;
const FILES_VIEW_FILEID_PATH = /^\/(?:index\.php\/)?apps\/files\/([^/]+)\/([^/]+)\/?$/;
const SHOW_FILE_PATH = /^\/(?:index\.php\/)?f\/([^/]+)\/?$/;
const DIRECT_EDITING_PATH = /^\/(?:index\.php\/)?apps\/files\/directEditing\/([^/]+)\/?$/;

const RESERVED_VIEW_SEGMENTS = new Set(['api', 'directEditing', 'preview-service-worker.js']);

function buildRequest(fullPath: string, options: ParityRequestOptions): Request {
	return new Request(`http://127.0.0.1:3100${fullPath.startsWith('/') ? fullPath : `/${fullPath}`}`, {
		method: options.method ?? 'GET',
		headers: options.headers,
	});
}

async function snapshotHandlerResponse(response: Response): Promise<ParityResponseSnapshot> {
	const rawBody = await response.text();

	return snapshotResponse(response, rawBody);
}

export function isFilesViewMockPath(pathname: string, method = 'GET'): boolean {
	if (method.toUpperCase() !== 'GET') {
		return false;
	}

	if (FILES_INDEX_PATH.test(pathname)) {
		return true;
	}

	if (SHOW_FILE_PATH.test(pathname)) {
		return true;
	}

	if (DIRECT_EDITING_PATH.test(pathname)) {
		return true;
	}

	const viewMatch = FILES_VIEW_PATH.exec(pathname);

	if (viewMatch && !RESERVED_VIEW_SEGMENTS.has(viewMatch[1])) {
		return true;
	}

	const viewFileMatch = FILES_VIEW_FILEID_PATH.exec(pathname);

	if (viewFileMatch && !RESERVED_VIEW_SEGMENTS.has(viewFileMatch[1])) {
		return true;
	}

	return false;
}

export async function handleFilesViewMock(
	fullPath: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	const pathname = fullPath.split('?')[0];
	const method = (options.method ?? 'GET').toUpperCase();

	if (method !== 'GET') {
		return null;
	}

	const request = buildRequest(fullPath, options);
	const url = new URL(request.url);

	if (FILES_INDEX_PATH.test(pathname)) {
		return snapshotHandlerResponse(handleFilesViewIndex(request, {
			dir: url.searchParams.get('dir') ?? '',
			view: url.searchParams.get('view') ?? '',
			fileid: url.searchParams.get('fileid'),
		}));
	}

	const directEditingMatch = DIRECT_EDITING_PATH.exec(pathname);

	if (directEditingMatch) {
		return snapshotHandlerResponse(handleDirectEditingView(request, decodeURIComponent(directEditingMatch[1])));
	}

	const showFileMatch = SHOW_FILE_PATH.exec(pathname);

	if (showFileMatch) {
		return snapshotHandlerResponse(handleShowFile(request, decodeURIComponent(showFileMatch[1]), {
			opendetails: url.searchParams.get('opendetails'),
			openfile: url.searchParams.get('openfile'),
		}));
	}

	const viewFileMatch = FILES_VIEW_FILEID_PATH.exec(pathname);

	if (viewFileMatch && !RESERVED_VIEW_SEGMENTS.has(viewFileMatch[1])) {
		return snapshotHandlerResponse(handleFilesViewIndex(request, {
			dir: url.searchParams.get('dir') ?? '',
			view: decodeURIComponent(viewFileMatch[1]),
			fileid: decodeURIComponent(viewFileMatch[2]),
		}));
	}

	const viewMatch = FILES_VIEW_PATH.exec(pathname);

	if (viewMatch && !RESERVED_VIEW_SEGMENTS.has(viewMatch[1])) {
		return snapshotHandlerResponse(handleFilesViewIndex(request, {
			dir: url.searchParams.get('dir') ?? '',
			view: decodeURIComponent(viewMatch[1]),
			fileid: url.searchParams.get('fileid'),
		}));
	}

	return null;
}
