import { handleSetConfig } from '@/src/server/files/api';

export async function PUT(request: Request, context: { params: Promise<{ key: string }> }) {
	const { key } = await context.params;

	return handleSetConfig(request, key);
}
