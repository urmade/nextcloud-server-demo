import { handleExAppScheduleTask } from '@/src/server/task-processing/ex-app-api';

export async function POST(request: Request) {
	return await handleExAppScheduleTask(request);
}
