import { handleSetResult } from '@/src/server/task-processing/ex-app-api';

export async function POST(request: Request, context: { params: Promise<{ taskId: string }> }) {
	const { taskId } = await context.params;

	return await handleSetResult(request, Number.parseInt(taskId, 10));
}
