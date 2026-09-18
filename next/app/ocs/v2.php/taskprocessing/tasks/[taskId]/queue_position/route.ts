import { handleGetTaskQueuePosition } from '@/src/server/task-processing/api';

export async function GET(
	request: Request,
	context: { params: Promise<{ taskId: string }> },
) {
	const { taskId } = await context.params;

	return await handleGetTaskQueuePosition(request, Number.parseInt(taskId, 10));
}
