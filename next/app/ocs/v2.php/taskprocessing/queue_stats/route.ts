import { handleQueueStats } from '@/src/server/task-processing/api';

export async function GET(request: Request) {
	return await handleQueueStats(request);
}
