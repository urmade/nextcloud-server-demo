import { handleTextToImageDeleteTask, handleTextToImageGetTask } from '@/src/server/text-to-image/api';

export async function GET(
	request: Request,
	context: { params: Promise<{ id: string }> },
) {
	const { id } = await context.params;

	return await handleTextToImageGetTask(request, Number.parseInt(id, 10));
}

export async function DELETE(
	request: Request,
	context: { params: Promise<{ id: string }> },
) {
	const { id } = await context.params;

	return await handleTextToImageDeleteTask(request, Number.parseInt(id, 10));
}
