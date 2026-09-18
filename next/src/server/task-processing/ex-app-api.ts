import { getPreviewFileById } from '@/src/server/preview/catalog';
import { getPreviewFixture } from '@/src/server/fixtures/binary';
import { requireExAppSession } from '@/src/server/ocs/ex-app-auth';
import {
	ocsFailureResponse,
	ocsSuccessResponse,
	parseOcsVersion,
} from '@/src/server/ocs/respond';
import { getAvailableTaskTypes, intersectTaskTypesAndProviders } from '@/src/server/task-processing/catalog';
import {
	cancelTaskById,
	claimNextScheduledTask,
	claimNextScheduledTaskBatch,
	deleteTaskById,
	getTaskById,
	getTaskFileById,
	getUserTask,
	NotFoundError,
	PreConditionNotMetError,
	scheduleExAppTask,
	setTaskIntermediateOutput,
	setTaskProgress,
	setTaskResult,
	UnauthorizedError,
	uploadTaskFile,
	ValidationError,
} from '@/src/server/task-processing/store';
import type { ScheduleTaskRequest, TaskProcessingIo } from '@/src/server/task-processing/types';

function parseJsonBody<T>(request: Request): Promise<T | null> {
	return request.json().catch(() => null);
}

export async function handleExAppTaskTypes(request: Request): Promise<Response> {
	const auth = requireExAppSession(request);

	if (auth instanceof Response) {
		return auth;
	}

	return ocsSuccessResponse({ types: getAvailableTaskTypes() }, parseOcsVersion(request));
}

export async function handleExAppScheduleTask(request: Request): Promise<Response> {
	const auth = requireExAppSession(request);

	if (auth instanceof Response) {
		return auth;
	}

	const body = await parseJsonBody<ScheduleTaskRequest>(request);
	const ocsVersion = parseOcsVersion(request);

	if (!body || typeof body.type !== 'string' || typeof body.appId !== 'string' || !body.input) {
		return ocsFailureResponse(ocsVersion, 400, '', { message: 'Missing key: "input"' });
	}

	try {
		const task = scheduleExAppTask(body);

		return ocsSuccessResponse({ task }, ocsVersion);
	} catch (error) {
		if (error instanceof UnauthorizedError) {
			return ocsFailureResponse(ocsVersion, 401, '', { message: error.message });
		}

		if (error instanceof PreConditionNotMetError) {
			return ocsFailureResponse(ocsVersion, 412, '', { message: error.message });
		}

		if (error instanceof ValidationError) {
			return ocsFailureResponse(ocsVersion, 400, '', { message: error.message });
		}

		return ocsFailureResponse(ocsVersion, 500, '', { message: 'Internal server error' });
	}
}

export async function handleExAppGetTask(request: Request, taskId: number): Promise<Response> {
	const auth = requireExAppSession(request);

	if (auth instanceof Response) {
		return auth;
	}

	const ocsVersion = parseOcsVersion(request);

	try {
		const task = getUserTask(taskId, null);

		return ocsSuccessResponse({ task }, ocsVersion);
	} catch (error) {
		if (error instanceof NotFoundError) {
			return ocsFailureResponse(ocsVersion, 404, '', { message: error.message });
		}

		return ocsFailureResponse(ocsVersion, 500, '', { message: 'Internal error' });
	}
}

export async function handleExAppDeleteTask(request: Request, taskId: number): Promise<Response> {
	const auth = requireExAppSession(request);

	if (auth instanceof Response) {
		return auth;
	}

	try {
		deleteTaskById(taskId);

		return ocsSuccessResponse(null, parseOcsVersion(request));
	} catch {
		return ocsFailureResponse(parseOcsVersion(request), 500, '', { message: 'Internal error' });
	}
}

export async function handleExAppCancelTask(request: Request, taskId: number): Promise<Response> {
	const auth = requireExAppSession(request);

	if (auth instanceof Response) {
		return auth;
	}

	const ocsVersion = parseOcsVersion(request);

	try {
		const task = cancelTaskById(taskId);

		return ocsSuccessResponse({ task }, ocsVersion);
	} catch (error) {
		if (error instanceof NotFoundError) {
			return ocsFailureResponse(ocsVersion, 404, '', { message: error.message });
		}

		return ocsFailureResponse(ocsVersion, 500, '', { message: 'Internal error' });
	}
}

export async function handleGetNextScheduledTask(request: Request): Promise<Response> {
	const auth = requireExAppSession(request);

	if (auth instanceof Response) {
		return auth;
	}

	const ocsVersion = parseOcsVersion(request);
	const url = new URL(request.url);
	const providerIds = url.searchParams.getAll('providerIds[]');
	const taskTypeIds = url.searchParams.getAll('taskTypeIds[]');

	try {
		const { taskTypeIds: possibleTaskTypeIds } = intersectTaskTypesAndProviders(taskTypeIds, providerIds);

		if (possibleTaskTypeIds.length === 0) {
			return new Response(null, { status: 204 });
		}

		const task = claimNextScheduledTask(possibleTaskTypeIds);

		if (task === null) {
			return new Response(null, { status: 204 });
		}

		return ocsSuccessResponse({
			task,
			provider: { name: task.type },
		}, ocsVersion);
	} catch {
		return ocsFailureResponse(ocsVersion, 500, '', { message: 'Internal error' });
	}
}

export async function handleGetNextScheduledTaskBatch(request: Request): Promise<Response> {
	const auth = requireExAppSession(request);

	if (auth instanceof Response) {
		return auth;
	}

	const ocsVersion = parseOcsVersion(request);
	const url = new URL(request.url);
	const providerIds = url.searchParams.getAll('providerIds[]');
	const taskTypeIds = url.searchParams.getAll('taskTypeIds[]');
	const numberOfTasks = Number.parseInt(url.searchParams.get('numberOfTasks') ?? '1', 10);

	try {
		const result = claimNextScheduledTaskBatch(
			providerIds,
			taskTypeIds,
			Number.isFinite(numberOfTasks) && numberOfTasks > 0 ? numberOfTasks : 1,
		);

		return ocsSuccessResponse(result, ocsVersion);
	} catch {
		return ocsFailureResponse(ocsVersion, 500, '', { message: 'Internal error' });
	}
}

export async function handleSetProgress(
	request: Request,
	taskId: number,
): Promise<Response> {
	const auth = requireExAppSession(request);

	if (auth instanceof Response) {
		return auth;
	}

	const ocsVersion = parseOcsVersion(request);
	const body = await parseJsonBody<{ progress?: number }>(request);
	const progress = body?.progress ?? 0;

	try {
		const task = setTaskProgress(taskId, progress);

		return ocsSuccessResponse({ task }, ocsVersion);
	} catch (error) {
		if (error instanceof NotFoundError) {
			return ocsFailureResponse(ocsVersion, 404, '', { message: error.message });
		}

		return ocsFailureResponse(ocsVersion, 500, '', { message: 'Internal error' });
	}
}

export async function handleSetResult(
	request: Request,
	taskId: number,
): Promise<Response> {
	const auth = requireExAppSession(request);

	if (auth instanceof Response) {
		return auth;
	}

	const ocsVersion = parseOcsVersion(request);
	const body = await parseJsonBody<{
		output?: TaskProcessingIo | null;
		errorMessage?: string | null;
		userFacingErrorMessage?: string | null;
	}>(request);

	try {
		const task = setTaskResult(
			taskId,
			body?.output ?? null,
			body?.errorMessage ?? null,
			body?.userFacingErrorMessage ?? null,
		);

		return ocsSuccessResponse({ task }, ocsVersion);
	} catch (error) {
		if (error instanceof NotFoundError) {
			return ocsFailureResponse(ocsVersion, 404, '', { message: error.message });
		}

		return ocsFailureResponse(ocsVersion, 500, '', { message: 'Internal error' });
	}
}

export async function handleSetIntermediateResult(
	request: Request,
	taskId: number,
): Promise<Response> {
	const auth = requireExAppSession(request);

	if (auth instanceof Response) {
		return auth;
	}

	const ocsVersion = parseOcsVersion(request);
	const body = await parseJsonBody<{ output?: TaskProcessingIo }>(request);

	if (!body?.output) {
		return ocsFailureResponse(ocsVersion, 400, '', { message: 'Missing key: "output"' });
	}

	try {
		const task = setTaskIntermediateOutput(taskId, body.output);

		return ocsSuccessResponse({ task }, ocsVersion);
	} catch (error) {
		if (error instanceof NotFoundError) {
			return ocsFailureResponse(ocsVersion, 404, '', { message: error.message });
		}

		return ocsFailureResponse(ocsVersion, 500, '', { message: 'Internal error' });
	}
}

export async function handleSetFileContentsExApp(
	request: Request,
	taskId: number,
): Promise<Response> {
	const auth = requireExAppSession(request);

	if (auth instanceof Response) {
		return auth;
	}

	const ocsVersion = parseOcsVersion(request);

	try {
		getTaskById(taskId);
	} catch (error) {
		if (error instanceof NotFoundError) {
			return ocsFailureResponse(ocsVersion, 404, '', { message: error.message });
		}

		return ocsFailureResponse(ocsVersion, 500, '', { message: 'Internal error' });
	}

	const formData = await request.formData().catch(() => null);
	const file = formData?.get('file');

	if (!(file instanceof File)) {
		return ocsFailureResponse(ocsVersion, 400, '', { message: 'Bad request' });
	}

	const bytes = new Uint8Array(await file.arrayBuffer());
	const fileId = uploadTaskFile(bytes, file.name, file.type || 'application/octet-stream');
	const envelope = {
		ocs: {
			meta: {
				status: 'ok' as const,
				statuscode: 201,
				message: 'OK',
			},
			data: { fileId },
		},
	};

	return Response.json(envelope, {
		status: 201,
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'cache-control': 'no-store, no-cache, must-revalidate',
		},
	});
}

export async function handleGetFileContentsExApp(
	request: Request,
	taskId: number,
	fileId: number,
): Promise<Response> {
	const auth = requireExAppSession(request);

	if (auth instanceof Response) {
		return auth;
	}

	const ocsVersion = parseOcsVersion(request);

	try {
		const task = getTaskById(taskId);
		const uploaded = getTaskFileById(task, fileId);

		if (uploaded) {
			return new Response(Buffer.from(uploaded.bytes), {
				status: 200,
				headers: {
					'content-type': uploaded.mime,
					'content-disposition': `attachment; filename="${uploaded.name}"`,
				},
			});
		}

		const previewFile = getPreviewFileById(fileId);

		if (previewFile?.readable) {
			const bytes = getPreviewFixture();

			return new Response(new Uint8Array(bytes), {
				status: 200,
				headers: {
					'content-type': previewFile.mime,
					'content-disposition': `attachment; filename="${previewFile.path}"`,
				},
			});
		}

		return ocsFailureResponse(ocsVersion, 404, '', { message: 'Not found' });
	} catch (error) {
		if (error instanceof NotFoundError) {
			return ocsFailureResponse(ocsVersion, 404, '', { message: 'Not found' });
		}

		return ocsFailureResponse(ocsVersion, 500, '', { message: 'Internal error' });
	}
}
