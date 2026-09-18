import { handleScheduleTask } from '@/src/server/task-processing/api';

export async function POST(request: Request) {
	return await handleScheduleTask(request);
}
