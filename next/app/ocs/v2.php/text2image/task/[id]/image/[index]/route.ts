import { handleTextToImageGetImage } from '@/src/server/text-to-image/api';

export async function GET(
	request: Request,
	context: { params: Promise<{ id: string; index: string }> },
) {
	const { id, index } = await context.params;

	return await handleTextToImageGetImage(
		request,
		Number.parseInt(id, 10),
		Number.parseInt(index, 10),
	);
}
