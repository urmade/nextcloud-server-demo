import { handleGetCurrentOutOfOfficeData } from '@/src/server/dav/out-of-office';

export async function GET(
	request: Request,
	context: { params: Promise<{ userId: string }> },
) {
	const { userId } = await context.params;

	return handleGetCurrentOutOfOfficeData(request, userId);
}
