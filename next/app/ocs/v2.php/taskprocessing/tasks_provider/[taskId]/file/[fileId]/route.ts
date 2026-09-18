import { handleGetFileContentsExApp } from '@/src/server/task-processing/ex-app-api';

export async function GET(request: Request, context: { params: Promise<{ taskId: string; fileId: string }> }) {
	const { taskId, fileId } = await context.params;

	return await handleGetFileContentsExApp(
		request,
		Number.parseInt(taskId, 10),
		Number.parseInt(fileId, 10),
	);
}
