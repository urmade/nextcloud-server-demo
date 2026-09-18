import { requireAuthenticatedUser } from '@/src/server/ocs/auth';
import {
	ocsFailureResponse,
	ocsSuccessResponse,
	parseOcsVersion,
} from '@/src/server/ocs/respond';
import { getAvailableTextProcessingTaskTypes } from '@/src/server/text-processing/catalog';
import {
	deleteTextProcessingUserTask,
	getTextProcessingUserTask,
	listTextProcessingTasksByApp,
	NotFoundError,
	PreConditionNotMetError,
	scheduleTextProcessingTask,
	ValidationError,
} from '@/src/server/text-processing/store';
import type { ScheduleTextProcessingRequest } from '@/src/server/text-processing/types';

function parseJsonBody<T>(request: Request): Promise<T | null> {
	return request.json().catch(() => null);
}

export async function handleTextProcessingTaskTypes(request: Request): Promise<Response> {
	return ocsSuccessResponse(
		{ types: getAvailableTextProcessingTaskTypes() },
		parseOcsVersion(request),
	);
}

export async function handleTextProcessingSchedule(request: Request): Promise<Response> {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const body = await parseJsonBody<ScheduleTextProcessingRequest>(request);
	const ocsVersion = parseOcsVersion(request);

	if (!body || typeof body.input !== 'string' || typeof body.type !== 'string' || typeof body.appId !== 'string') {
		return ocsFailureResponse(ocsVersion, 400, '', { message: 'Requested task type does not exist' });
	}

	try {
		const task = scheduleTextProcessingTask(auth, body);

		return ocsSuccessResponse({ task }, ocsVersion);
	} catch (error) {
		if (error instanceof ValidationError) {
			return ocsFailureResponse(ocsVersion, 400, '', { message: error.message });
		}

		if (error instanceof PreConditionNotMetError) {
			return ocsFailureResponse(ocsVersion, 412, '', { message: error.message });
		}

		return ocsFailureResponse(ocsVersion, 500, '', { message: 'Internal server error' });
	}
}

export async function handleTextProcessingGetTask(request: Request, taskId: number): Promise<Response> {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const ocsVersion = parseOcsVersion(request);

	try {
		const task = getTextProcessingUserTask(taskId, auth);

		return ocsSuccessResponse({ task }, ocsVersion);
	} catch (error) {
		if (error instanceof NotFoundError) {
			return ocsFailureResponse(ocsVersion, 404, '', { message: error.message });
		}

		return ocsFailureResponse(ocsVersion, 500, '', { message: 'Internal error' });
	}
}

export async function handleTextProcessingDeleteTask(request: Request, taskId: number): Promise<Response> {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const ocsVersion = parseOcsVersion(request);

	try {
		const task = deleteTextProcessingUserTask(taskId, auth);

		return ocsSuccessResponse({ task }, ocsVersion);
	} catch (error) {
		if (error instanceof NotFoundError) {
			return ocsFailureResponse(ocsVersion, 404, '', { message: error.message });
		}

		return ocsFailureResponse(ocsVersion, 500, '', { message: 'Internal error' });
	}
}

export async function handleTextProcessingListTasksByApp(request: Request, appId: string): Promise<Response> {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const url = new URL(request.url);
	const identifier = url.searchParams.get('identifier');

	try {
		const tasks = listTextProcessingTasksByApp(auth, appId, identifier);

		return ocsSuccessResponse({ tasks }, parseOcsVersion(request));
	} catch {
		return ocsFailureResponse(parseOcsVersion(request), 500, '', { message: 'Internal error' });
	}
}
