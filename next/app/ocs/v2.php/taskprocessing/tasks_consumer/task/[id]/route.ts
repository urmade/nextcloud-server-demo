import { handleExAppDeleteTask, handleExAppGetTask } from '@/src/server/task-processing/ex-app-api';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
	const { id } = await context.params;

	return await handleExAppGetTask(request, Number.parseInt(id, 10));
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
	const { id } = await context.params;

	return await handleExAppDeleteTask(request, Number.parseInt(id, 10));
}
