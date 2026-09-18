import { getPreviewFileById } from '@/src/server/preview/catalog';
import { getPreviewFixture } from '@/src/server/fixtures/binary';
import { requireAuthenticatedUser } from '@/src/server/ocs/auth';
import {
	ocsFailureResponse,
	ocsSuccessResponse,
	parseOcsVersion,
} from '@/src/server/ocs/respond';
import { getAvailableTaskTypes } from '@/src/server/task-processing/catalog';
import {
	cancelUserTask,
	countTasks,
	deleteUserTask,
	extractFileIdsFromTask,
	getTaskQueuePosition,
	getUserTask,
	listUserTasks,
	listUserTasksByApp,
	NotFoundError,
	PreConditionNotMetError,
	scheduleTask,
	ValidationError,
} from '@/src/server/task-processing/store';
import type { ScheduleTaskRequest } from '@/src/server/task-processing/types';

function parseJsonBody<T>(request: Request): Promise<T | null> {
	return request.json().catch(() => null);
}

export async function handleTaskTypes(request: Request): Promise<Response> {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	return ocsSuccessResponse({ types: getAvailableTaskTypes() }, parseOcsVersion(request));
}

export async function handleQueueStats(request: Request): Promise<Response> {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const url = new URL(request.url);
	const taskTypeIds = url.searchParams.getAll('taskTypeIds[]');

	return ocsSuccessResponse({
		scheduled_count: countTasks('STATUS_SCHEDULED', taskTypeIds),
		running_count: countTasks('STATUS_RUNNING', taskTypeIds),
	}, parseOcsVersion(request));
}

export async function handleScheduleTask(request: Request): Promise<Response> {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const body = await parseJsonBody<ScheduleTaskRequest>(request);
	const ocsVersion = parseOcsVersion(request);

	if (!body || typeof body.type !== 'string' || typeof body.appId !== 'string' || !body.input) {
		return ocsFailureResponse(ocsVersion, 400, '', { message: 'Missing key: "input"' });
	}

	try {
		const task = scheduleTask(auth, body);

		return ocsSuccessResponse({ task }, ocsVersion);
	} catch (error) {
		if (error instanceof PreConditionNotMetError) {
			return ocsFailureResponse(ocsVersion, 412, '', { message: error.message });
		}

		if (error instanceof ValidationError) {
			return ocsFailureResponse(ocsVersion, 400, '', { message: error.message });
		}

		return ocsFailureResponse(ocsVersion, 500, '', { message: 'Internal server error' });
	}
}

export async function handleGetTask(request: Request, taskId: number): Promise<Response> {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const ocsVersion = parseOcsVersion(request);

	try {
		const task = getUserTask(taskId, auth);

		return ocsSuccessResponse({ task }, ocsVersion);
	} catch (error) {
		if (error instanceof NotFoundError) {
			return ocsFailureResponse(ocsVersion, 404, '', { message: error.message });
		}

		return ocsFailureResponse(ocsVersion, 500, '', { message: 'Internal error' });
	}
}

export async function handleDeleteTask(request: Request, taskId: number): Promise<Response> {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	try {
		deleteUserTask(taskId, auth);

		return ocsSuccessResponse(null, parseOcsVersion(request));
	} catch {
		return ocsFailureResponse(parseOcsVersion(request), 500, '', { message: 'Internal error' });
	}
}

export async function handleListTasks(request: Request): Promise<Response> {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const url = new URL(request.url);
	const taskType = url.searchParams.get('taskType');
	const customId = url.searchParams.get('customId');

	try {
		const tasks = listUserTasks(auth, taskType, customId);

		return ocsSuccessResponse({ tasks }, parseOcsVersion(request));
	} catch {
		return ocsFailureResponse(parseOcsVersion(request), 500, '', { message: 'Internal error' });
	}
}

export async function handleListTasksByApp(request: Request, appId: string): Promise<Response> {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const url = new URL(request.url);
	const customId = url.searchParams.get('customId');

	try {
		const tasks = listUserTasksByApp(auth, appId, customId);

		return ocsSuccessResponse({ tasks }, parseOcsVersion(request));
	} catch {
		return ocsFailureResponse(parseOcsVersion(request), 500, '', { message: 'Internal error' });
	}
}

export async function handleCancelTask(request: Request, taskId: number): Promise<Response> {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const ocsVersion = parseOcsVersion(request);

	try {
		const task = cancelUserTask(taskId, auth);

		return ocsSuccessResponse({ task }, ocsVersion);
	} catch (error) {
		if (error instanceof NotFoundError) {
			return ocsFailureResponse(ocsVersion, 404, '', { message: error.message });
		}

		return ocsFailureResponse(ocsVersion, 500, '', { message: 'Internal error' });
	}
}

export async function handleGetTaskQueuePosition(request: Request, taskId: number): Promise<Response> {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const ocsVersion = parseOcsVersion(request);

	try {
		const position = getTaskQueuePosition(taskId, auth);

		return ocsSuccessResponse(position, ocsVersion);
	} catch (error) {
		if (error instanceof NotFoundError) {
			return ocsFailureResponse(ocsVersion, 404, '', { message: error.message });
		}

		if (error instanceof PreConditionNotMetError) {
			return ocsFailureResponse(ocsVersion, 412, '', { message: error.message });
		}

		return ocsFailureResponse(ocsVersion, 500, '', { message: 'Internal error' });
	}
}

export async function handleGetFileContents(
	request: Request,
	taskId: number,
	fileId: number,
): Promise<Response> {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const ocsVersion = parseOcsVersion(request);

	try {
		const task = getUserTask(taskId, auth);
		const fileIds = extractFileIdsFromTask(task);

		if (!fileIds.includes(fileId)) {
			return ocsFailureResponse(ocsVersion, 404, '', { message: 'Not found' });
		}

		const previewFile = getPreviewFileById(fileId);

		if (!previewFile?.readable) {
			return ocsFailureResponse(ocsVersion, 404, '', { message: 'Not found' });
		}

		const bytes = getPreviewFixture();

		return new Response(new Uint8Array(bytes), {
			status: 200,
			headers: {
				'content-type': previewFile.mime,
				'content-disposition': `attachment; filename="${previewFile.path}"`,
			},
		});
	} catch (error) {
		if (error instanceof NotFoundError) {
			return ocsFailureResponse(ocsVersion, 404, '', { message: 'Not found' });
		}

		return ocsFailureResponse(ocsVersion, 500, '', { message: 'Internal error' });
	}
}
