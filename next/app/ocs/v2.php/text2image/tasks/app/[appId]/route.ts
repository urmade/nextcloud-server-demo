import { handleTextToImageListTasksByApp } from '@/src/server/text-to-image/api';

export async function GET(
	request: Request,
	context: { params: Promise<{ appId: string }> },
) {
	const { appId } = await context.params;

	return await handleTextToImageListTasksByApp(request, decodeURIComponent(appId));
}
