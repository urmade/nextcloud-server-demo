import { handleListTasksByApp } from '@/src/server/task-processing/api';

export async function GET(
	request: Request,
	context: { params: Promise<{ appId: string }> },
) {
	const { appId } = await context.params;

	return await handleListTasksByApp(request, appId);
}
