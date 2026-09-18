import {
	handleCancelTask,
	handleDeleteTask,
	handleGetFileContents,
	handleGetTask,
	handleGetTaskQueuePosition,
	handleListTasks,
	handleListTasksByApp,
	handleQueueStats,
	handleScheduleTask,
	handleTaskTypes,
} from '@/src/server/task-processing/api';
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

export async function handleTaskProcessingMock(
	pathname: string,
	search: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	const method = (options.method ?? 'GET').toUpperCase();
	const request = buildRequest(pathname, search, options);

	if (method === 'GET' && pathname === '/ocs/v2.php/taskprocessing/tasktypes') {
		return responseToSnapshot(await handleTaskTypes(request));
	}

	if (method === 'GET' && pathname === '/ocs/v2.php/taskprocessing/queue_stats') {
		return responseToSnapshot(await handleQueueStats(request));
	}

	if (method === 'POST' && pathname === '/ocs/v2.php/taskprocessing/schedule') {
		return responseToSnapshot(await handleScheduleTask(request));
	}

	if (method === 'GET' && pathname === '/ocs/v2.php/taskprocessing/tasks') {
		return responseToSnapshot(await handleListTasks(request));
	}

	const taskMatch = /^\/ocs\/v2\.php\/taskprocessing\/task\/(\d+)$/.exec(pathname);

	if (taskMatch) {
		const taskId = Number.parseInt(taskMatch[1], 10);

		if (method === 'GET') {
			return responseToSnapshot(await handleGetTask(request, taskId));
		}

		if (method === 'DELETE') {
			return responseToSnapshot(await handleDeleteTask(request, taskId));
		}
	}

	const listByAppMatch = /^\/ocs\/v2\.php\/taskprocessing\/tasks\/app\/([^/]+)$/.exec(pathname);

	if (method === 'GET' && listByAppMatch) {
		return responseToSnapshot(await handleListTasksByApp(request, decodeURIComponent(listByAppMatch[1])));
	}

	const cancelMatch = /^\/ocs\/v2\.php\/taskprocessing\/tasks\/(\d+)\/cancel$/.exec(pathname);

	if (method === 'POST' && cancelMatch) {
		return responseToSnapshot(await handleCancelTask(request, Number.parseInt(cancelMatch[1], 10)));
	}

	const queuePositionMatch = /^\/ocs\/v2\.php\/taskprocessing\/tasks\/(\d+)\/queue_position$/.exec(pathname);

	if (method === 'GET' && queuePositionMatch) {
		return responseToSnapshot(await handleGetTaskQueuePosition(request, Number.parseInt(queuePositionMatch[1], 10)));
	}

	const fileMatch = /^\/ocs\/v2\.php\/taskprocessing\/tasks\/(\d+)\/file\/(\d+)$/.exec(pathname);

	if (method === 'GET' && fileMatch) {
		return responseToSnapshot(await handleGetFileContents(
			request,
			Number.parseInt(fileMatch[1], 10),
			Number.parseInt(fileMatch[2], 10),
		));
	}

	return null;
}
