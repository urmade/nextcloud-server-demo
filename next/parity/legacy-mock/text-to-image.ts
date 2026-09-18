import {
	handleTextToImageDeleteTask,
	handleTextToImageGetImage,
	handleTextToImageGetTask,
	handleTextToImageIsAvailable,
	handleTextToImageListTasksByApp,
	handleTextToImageSchedule,
} from '@/src/server/text-to-image/api';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';
import { snapshotResponse } from '../compare';

function buildRequest(pathname: string, search: string, options: ParityRequestOptions): Request {
	const origin = 'http://127.0.0.1:3100';

	return new Request(`${origin}${pathname}${search ? `?${search}` : ''}`, {
		method: options.method ?? 'GET',
		headers: options.headers ?? {},
		body: options.body,
	});
}

async function responseToSnapshot(response: Response): Promise<ParityResponseSnapshot> {
	const contentType = response.headers.get('content-type') ?? '';

	if (contentType.startsWith('image/')) {
		const rawBody = Buffer.from(await response.arrayBuffer()).toString('latin1');

		return snapshotResponse(response, rawBody);
	}

	const rawBody = await response.text();

	return snapshotResponse(response, rawBody);
}

export async function handleTextToImageMock(
	pathname: string,
	search: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	const method = (options.method ?? 'GET').toUpperCase();
	const request = buildRequest(pathname, search, options);

	if (method === 'GET' && pathname === '/ocs/v2.php/text2image/is_available') {
		return responseToSnapshot(await handleTextToImageIsAvailable(request));
	}

	if (method === 'POST' && pathname === '/ocs/v2.php/text2image/schedule') {
		return responseToSnapshot(await handleTextToImageSchedule(request));
	}

	const taskMatch = /^\/ocs\/v2\.php\/text2image\/task\/(\d+)$/.exec(pathname);

	if (taskMatch) {
		const taskId = Number.parseInt(taskMatch[1], 10);

		if (method === 'GET') {
			return responseToSnapshot(await handleTextToImageGetTask(request, taskId));
		}

		if (method === 'DELETE') {
			return responseToSnapshot(await handleTextToImageDeleteTask(request, taskId));
		}
	}

	const imageMatch = /^\/ocs\/v2\.php\/text2image\/task\/(\d+)\/image\/(\d+)$/.exec(pathname);

	if (method === 'GET' && imageMatch) {
		return responseToSnapshot(await handleTextToImageGetImage(
			request,
			Number.parseInt(imageMatch[1], 10),
			Number.parseInt(imageMatch[2], 10),
		));
	}

	const listByAppMatch = /^\/ocs\/v2\.php\/text2image\/tasks\/app\/([^/]+)$/.exec(pathname);

	if (method === 'GET' && listByAppMatch) {
		return responseToSnapshot(await handleTextToImageListTasksByApp(
			request,
			decodeURIComponent(listByAppMatch[1]),
		));
	}

	return null;
}
