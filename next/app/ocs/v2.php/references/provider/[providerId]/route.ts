import { handleTouchProvider } from '@/src/server/reference/api';

export async function PUT(
	request: Request,
	context: { params: Promise<{ providerId: string }> },
) {
	const { providerId } = await context.params;

	return await handleTouchProvider(request, providerId);
}
