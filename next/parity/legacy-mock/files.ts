import {
	handleCropImagePreviews,
	handleGetConfigs,
	handleGetGridView,
	handleGetRecentFiles,
	handleServiceWorker,
	handleGetStorageStats,
	handleGetThumbnail,
	handleGetViewConfigs,
	handleSetConfig,
	handleSetViewConfig,
	handleShowGridView,
	handleShowHiddenFiles,
	handleUpdateFileTags,
} from '@/src/server/files/api';
import { snapshotResponse } from '../compare';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';

const FILES_API_GET_HANDLERS: Record<string, (request: Request) => Response> = {
	'/apps/files/api/v1/configs': handleGetConfigs,
	'/apps/files/api/v1/views': handleGetViewConfigs,
	'/apps/files/api/v1/stats': handleGetStorageStats,
	'/apps/files/api/v1/showgridview': handleGetGridView,
	'/apps/files/api/v1/recent': handleGetRecentFiles,
	'/apps/files/api/v1/recent/': handleGetRecentFiles,
	'/apps/files/preview-service-worker.js': handleServiceWorker,
};

const THUMBNAIL_PATH = /^\/(?:index\.php\/)?apps\/files\/api\/v1\/thumbnail\/([^/]+)\/([^/]+)\/(.+)$/;

const FILES_API_WRITE_HANDLERS: Array<{
	method: 'PUT' | 'POST';
	match: (pathname: string) => boolean;
	handle: (request: Request, pathname: string) => Promise<Response>;
}> = [
	{
		method: 'PUT',
		match: (pathname) => /^\/apps\/files\/api\/v1\/config\/[^/]+$/.test(pathname),
		handle: async (request, pathname) => {
			const key = decodeURIComponent(pathname.split('/').pop() ?? '');

			return handleSetConfig(request, key);
		},
	},
	{
		method: 'PUT',
		match: (pathname) => pathname === '/apps/files/api/v1/views',
		handle: async (request) => handleSetViewConfig(request),
	},
	{
		method: 'PUT',
		match: (pathname) => /^\/apps\/files\/api\/v1\/views\/[^/]+\/[^/]+$/.test(pathname),
		handle: async (request, pathname) => {
			const segments = pathname.split('/');
			const key = decodeURIComponent(segments.pop() ?? '');
			const view = decodeURIComponent(segments.pop() ?? '');

			return handleSetViewConfig(request, view, key);
		},
	},
	{
		method: 'POST',
		match: (pathname) => pathname === '/apps/files/api/v1/showhidden',
		handle: async (request) => handleShowHiddenFiles(request),
	},
	{
		method: 'POST',
		match: (pathname) => pathname === '/apps/files/api/v1/showgridview',
		handle: async (request) => handleShowGridView(request),
	},
	{
		method: 'POST',
		match: (pathname) => pathname === '/apps/files/api/v1/cropimagepreviews',
		handle: async (request) => handleCropImagePreviews(request),
	},
	{
		method: 'POST',
		match: (pathname) => /^\/apps\/files\/api\/v1\/files\/.+/.test(pathname),
		handle: async (request, pathname) => {
			const filePath = decodeURIComponent(pathname.replace(/^\/apps\/files\/api\/v1\/files\//, ''));

			return handleUpdateFileTags(request, filePath);
		},
	},
];

export function isFilesApiPath(pathname: string): boolean {
	if (pathname in FILES_API_GET_HANDLERS) {
		return true;
	}

	return THUMBNAIL_PATH.test(pathname);
}

export function isFilesApiWritePath(pathname: string, method: string): boolean {
	const normalizedMethod = method.toUpperCase();

	return FILES_API_WRITE_HANDLERS.some((entry) => entry.method === normalizedMethod && entry.match(pathname));
}

export async function handleFilesApiMock(
	fullPath: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	const pathname = fullPath.split('?')[0];
	const method = (options.method ?? 'GET').toUpperCase();
	const getHandler = FILES_API_GET_HANDLERS[pathname];

	if (method === 'GET' && getHandler) {
		const request = new Request(`http://127.0.0.1:3100${fullPath.startsWith('/') ? fullPath : `/${fullPath}`}`, {
			method,
			headers: options.headers,
		});
		const response = getHandler(request);
		const rawBody = await response.text();

		return snapshotResponse(response, rawBody);
	}

	if (method === 'GET') {
		const thumbnailMatch = THUMBNAIL_PATH.exec(pathname);

		if (thumbnailMatch) {
			const [, x, y, encodedFile] = thumbnailMatch;
			const request = new Request(`http://127.0.0.1:3100${fullPath.startsWith('/') ? fullPath : `/${fullPath}`}`, {
				method,
				headers: options.headers,
			});
			const response = handleGetThumbnail(request, x, y, decodeURIComponent(encodedFile));
			const rawBody = await response.text();

			return snapshotResponse(response, rawBody);
		}
	}

	const writeHandler = FILES_API_WRITE_HANDLERS.find((entry) => entry.method === method && entry.match(pathname));

	if (writeHandler) {
		const request = new Request(`http://127.0.0.1:3100${fullPath.startsWith('/') ? fullPath : `/${fullPath}`}`, {
			method,
			headers: options.headers,
			body: options.body,
		});
		const response = await writeHandler.handle(request, pathname);
		const rawBody = await response.text();

		return snapshotResponse(response, rawBody);
	}

	return null;
}
