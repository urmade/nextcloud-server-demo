import { handleTextProcessingListTasksByApp } from '@/src/server/text-processing/api';

export async function GET(
	request: Request,
	context: { params: Promise<{ appId: string }> },
) {
	const { appId } = await context.params;

	return await handleTextProcessingListTasksByApp(request, decodeURIComponent(appId));
}
