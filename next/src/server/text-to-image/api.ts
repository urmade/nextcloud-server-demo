import { requireAuthenticatedUser } from '@/src/server/ocs/auth';
import {
	ocsFailureResponse,
	ocsSuccessResponse,
	parseOcsVersion,
} from '@/src/server/ocs/respond';
import { isTextToImageProviderAvailable } from '@/src/server/text-to-image/catalog';
import {
	deleteTextToImageUserTask,
	getTextToImageBytes,
	getTextToImageUserTask,
	ImageNotFoundError,
	listTextToImageTasksByApp,
	NotFoundError,
	PreConditionNotMetError,
	scheduleTextToImageTask,
} from '@/src/server/text-to-image/store';
import type { ScheduleTextToImageRequest } from '@/src/server/text-to-image/types';

function parseJsonBody<T>(request: Request): Promise<T | null> {
	return request.json().catch(() => null);
}

export async function handleTextToImageIsAvailable(request: Request): Promise<Response> {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	return ocsSuccessResponse(
		{ isAvailable: isTextToImageProviderAvailable() },
		parseOcsVersion(request),
	);
}

export async function handleTextToImageSchedule(request: Request): Promise<Response> {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const body = await parseJsonBody<ScheduleTextToImageRequest>(request);
	const ocsVersion = parseOcsVersion(request);

	if (!body || typeof body.input !== 'string' || typeof body.appId !== 'string') {
		return ocsFailureResponse(ocsVersion, 412, '', { message: 'No text to image provider is available' });
	}

	try {
		const task = scheduleTextToImageTask(auth, body);

		return ocsSuccessResponse({ task }, ocsVersion);
	} catch (error) {
		if (error instanceof PreConditionNotMetError) {
			return ocsFailureResponse(ocsVersion, 412, '', { message: error.message });
		}

		return ocsFailureResponse(ocsVersion, 500, '', { message: 'Internal error' });
	}
}

export async function handleTextToImageGetTask(request: Request, taskId: number): Promise<Response> {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const ocsVersion = parseOcsVersion(request);

	try {
		const task = getTextToImageUserTask(taskId, auth);

		return ocsSuccessResponse({ task }, ocsVersion);
	} catch (error) {
		if (error instanceof NotFoundError) {
			return ocsFailureResponse(ocsVersion, 404, '', { message: error.message });
		}

		return ocsFailureResponse(ocsVersion, 500, '', { message: 'Internal error' });
	}
}

export async function handleTextToImageDeleteTask(request: Request, taskId: number): Promise<Response> {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const ocsVersion = parseOcsVersion(request);

	try {
		const task = deleteTextToImageUserTask(taskId, auth);

		return ocsSuccessResponse({ task }, ocsVersion);
	} catch (error) {
		if (error instanceof NotFoundError) {
			return ocsFailureResponse(ocsVersion, 404, '', { message: error.message });
		}

		return ocsFailureResponse(ocsVersion, 500, '', { message: 'Internal error' });
	}
}

export async function handleTextToImageListTasksByApp(request: Request, appId: string): Promise<Response> {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const url = new URL(request.url);
	const identifier = url.searchParams.get('identifier');

	try {
		const tasks = listTextToImageTasksByApp(auth, appId, identifier);

		return ocsSuccessResponse({ tasks }, parseOcsVersion(request));
	} catch {
		return ocsFailureResponse(parseOcsVersion(request), 500, '', { message: 'Internal error' });
	}
}

export async function handleTextToImageGetImage(
	request: Request,
	taskId: number,
	index: number,
): Promise<Response> {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const ocsVersion = parseOcsVersion(request);

	try {
		const bytes = getTextToImageBytes(taskId, auth, index);

		return new Response(new Uint8Array(bytes), {
			status: 200,
			headers: {
				'content-type': 'image/png',
			},
		});
	} catch (error) {
		if (error instanceof NotFoundError) {
			return ocsFailureResponse(ocsVersion, 404, '', { message: error.message });
		}

		if (error instanceof ImageNotFoundError) {
			return ocsFailureResponse(ocsVersion, 404, '', { message: error.message });
		}

		return ocsFailureResponse(ocsVersion, 500, '', { message: 'Internal error' });
	}
}
