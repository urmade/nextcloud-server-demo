import { handleDirectEditingView } from '@/src/server/files/view';

export async function GET(
	request: Request,
	context: { params: Promise<{ token: string }> },
) {
	const { token } = await context.params;

	return handleDirectEditingView(request, token);
}
