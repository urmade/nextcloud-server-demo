import { handleGetNextScheduledTaskBatch } from '@/src/server/task-processing/ex-app-api';

export async function GET(request: Request) {
	return await handleGetNextScheduledTaskBatch(request);
}
