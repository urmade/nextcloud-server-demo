import { handleDeleteTask, handleGetTask } from '@/src/server/task-processing/api';

export async function GET(
	request: Request,
	context: { params: Promise<{ id: string }> },
) {
	const { id } = await context.params;

	return await handleGetTask(request, Number.parseInt(id, 10));
}

export async function DELETE(
	request: Request,
	context: { params: Promise<{ id: string }> },
) {
	const { id } = await context.params;

	return await handleDeleteTask(request, Number.parseInt(id, 10));
}
