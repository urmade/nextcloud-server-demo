import { handleTextProcessingDeleteTask, handleTextProcessingGetTask } from '@/src/server/text-processing/api';

export async function GET(
	request: Request,
	context: { params: Promise<{ id: string }> },
) {
	const { id } = await context.params;

	return await handleTextProcessingGetTask(request, Number.parseInt(id, 10));
}

export async function DELETE(
	request: Request,
	context: { params: Promise<{ id: string }> },
) {
	const { id } = await context.params;

	return await handleTextProcessingDeleteTask(request, Number.parseInt(id, 10));
}
