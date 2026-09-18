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
import {
	handleExAppCancelTask,
	handleExAppDeleteTask,
	handleExAppGetTask,
	handleExAppScheduleTask,
	handleExAppTaskTypes,
	handleGetFileContentsExApp,
	handleGetNextScheduledTask,
	handleGetNextScheduledTaskBatch,
	handleSetFileContentsExApp,
	handleSetIntermediateResult,
	handleSetProgress,
	handleSetResult,
} from '@/src/server/task-processing/ex-app-api';
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

	if (method === 'GET' && pathname === '/ocs/v2.php/taskprocessing/tasks_consumer/tasktypes') {
		return responseToSnapshot(await handleExAppTaskTypes(request));
	}

	if (method === 'POST' && pathname === '/ocs/v2.php/taskprocessing/tasks_consumer/schedule') {
		return responseToSnapshot(await handleExAppScheduleTask(request));
	}

	if (method === 'GET' && pathname === '/ocs/v2.php/taskprocessing/tasks_provider/next') {
		return responseToSnapshot(await handleGetNextScheduledTask(request));
	}

	if (method === 'GET' && pathname === '/ocs/v2.php/taskprocessing/tasks_provider/next_batch') {
		return responseToSnapshot(await handleGetNextScheduledTaskBatch(request));
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

	const exAppTaskMatch = /^\/ocs\/v2\.php\/taskprocessing\/tasks_consumer\/task\/(\d+)$/.exec(pathname);

	if (exAppTaskMatch) {
		const taskId = Number.parseInt(exAppTaskMatch[1], 10);

		if (method === 'GET') {
			return responseToSnapshot(await handleExAppGetTask(request, taskId));
		}

		if (method === 'DELETE') {
			return responseToSnapshot(await handleExAppDeleteTask(request, taskId));
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

	const exAppCancelMatch = /^\/ocs\/v2\.php\/taskprocessing\/tasks_consumer\/tasks\/(\d+)\/cancel$/.exec(pathname);

	if (method === 'POST' && exAppCancelMatch) {
		return responseToSnapshot(await handleExAppCancelTask(request, Number.parseInt(exAppCancelMatch[1], 10)));
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

	const providerProgressMatch = /^\/ocs\/v2\.php\/taskprocessing\/tasks_provider\/(\d+)\/progress$/.exec(pathname);

	if (method === 'POST' && providerProgressMatch) {
		return responseToSnapshot(await handleSetProgress(request, Number.parseInt(providerProgressMatch[1], 10)));
	}

	const providerResultMatch = /^\/ocs\/v2\.php\/taskprocessing\/tasks_provider\/(\d+)\/result$/.exec(pathname);

	if (method === 'POST' && providerResultMatch) {
		return responseToSnapshot(await handleSetResult(request, Number.parseInt(providerResultMatch[1], 10)));
	}

	const providerStreamMatch = /^\/ocs\/v2\.php\/taskprocessing\/tasks_provider\/(\d+)\/stream-result$/.exec(pathname);

	if (method === 'POST' && providerStreamMatch) {
		return responseToSnapshot(await handleSetIntermediateResult(request, Number.parseInt(providerStreamMatch[1], 10)));
	}

	const providerUploadMatch = /^\/ocs\/v2\.php\/taskprocessing\/tasks_provider\/(\d+)\/file$/.exec(pathname);

	if (method === 'POST' && providerUploadMatch) {
		return responseToSnapshot(await handleSetFileContentsExApp(request, Number.parseInt(providerUploadMatch[1], 10)));
	}

	const providerFileMatch = /^\/ocs\/v2\.php\/taskprocessing\/tasks_provider\/(\d+)\/file\/(\d+)$/.exec(pathname);

	if (method === 'GET' && providerFileMatch) {
		return responseToSnapshot(await handleGetFileContentsExApp(
			request,
			Number.parseInt(providerFileMatch[1], 10),
			Number.parseInt(providerFileMatch[2], 10),
		));
	}

	return null;
}
