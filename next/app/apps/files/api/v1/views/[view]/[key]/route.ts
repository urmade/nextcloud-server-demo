import { handleSetViewConfig } from '@/src/server/files/api';

export async function PUT(
	request: Request,
	context: { params: Promise<{ view: string; key: string }> },
) {
	const { view, key } = await context.params;

	return handleSetViewConfig(request, view, key);
}
