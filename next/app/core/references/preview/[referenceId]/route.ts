import { getReferencePreviewResponse } from '@/src/server/reference/preview';

export async function GET(
	_request: Request,
	context: { params: Promise<{ referenceId: string }> },
) {
	const { referenceId } = await context.params;

	return getReferencePreviewResponse(referenceId);
}
