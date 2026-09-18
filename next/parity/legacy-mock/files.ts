import {
	handleGetConfigs,
	handleGetGridView,
	handleGetStorageStats,
	handleGetViewConfigs,
} from '@/src/server/files/api';
import { snapshotResponse } from '../compare';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';

const FILES_API_GET_HANDLERS: Record<string, (request: Request) => Response> = {
	'/apps/files/api/v1/configs': handleGetConfigs,
	'/apps/files/api/v1/views': handleGetViewConfigs,
	'/apps/files/api/v1/stats': handleGetStorageStats,
	'/apps/files/api/v1/showgridview': handleGetGridView,
};

export function isFilesApiPath(pathname: string): boolean {
	return pathname in FILES_API_GET_HANDLERS;
}

export async function handleFilesApiMock(
	fullPath: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	const pathname = fullPath.split('?')[0];
	const handler = FILES_API_GET_HANDLERS[pathname];

	if (!handler) {
		return null;
	}

	const method = (options.method ?? 'GET').toUpperCase();

	if (method !== 'GET') {
		return null;
	}

	const request = new Request(`http://127.0.0.1:3100${fullPath.startsWith('/') ? fullPath : `/${fullPath}`}`, {
		method,
		headers: options.headers,
	});
	const response = handler(request);
	const rawBody = await response.text();

	return snapshotResponse(response, rawBody);
}
