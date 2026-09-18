import {
	handleTextProcessingDeleteTask,
	handleTextProcessingGetTask,
	handleTextProcessingListTasksByApp,
	handleTextProcessingSchedule,
	handleTextProcessingTaskTypes,
} from '@/src/server/text-processing/api';
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
	const rawBody = await response.text();

	return snapshotResponse(response, rawBody);
}

export async function handleTextProcessingMock(
	pathname: string,
	search: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	const method = (options.method ?? 'GET').toUpperCase();
	const request = buildRequest(pathname, search, options);

	if (method === 'GET' && pathname === '/ocs/v2.php/textprocessing/tasktypes') {
		return responseToSnapshot(await handleTextProcessingTaskTypes(request));
	}

	if (method === 'POST' && pathname === '/ocs/v2.php/textprocessing/schedule') {
		return responseToSnapshot(await handleTextProcessingSchedule(request));
	}

	const taskMatch = /^\/ocs\/v2\.php\/textprocessing\/task\/(\d+)$/.exec(pathname);

	if (taskMatch) {
		const taskId = Number.parseInt(taskMatch[1], 10);

		if (method === 'GET') {
			return responseToSnapshot(await handleTextProcessingGetTask(request, taskId));
		}

		if (method === 'DELETE') {
			return responseToSnapshot(await handleTextProcessingDeleteTask(request, taskId));
		}
	}

	const listByAppMatch = /^\/ocs\/v2\.php\/textprocessing\/tasks\/app\/([^/]+)$/.exec(pathname);

	if (method === 'GET' && listByAppMatch) {
		return responseToSnapshot(await handleTextProcessingListTasksByApp(
			request,
			decodeURIComponent(listByAppMatch[1]),
		));
	}

	return null;
}
