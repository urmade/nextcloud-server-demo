import { handleCancelTask } from '@/src/server/task-processing/api';

export async function POST(
	request: Request,
	context: { params: Promise<{ taskId: string }> },
) {
	const { taskId } = await context.params;

	return await handleCancelTask(request, Number.parseInt(taskId, 10));
}
