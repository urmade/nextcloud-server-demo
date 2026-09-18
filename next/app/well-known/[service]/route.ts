import { handleWellKnown } from '@/src/server/well-known/handlers';

export async function GET(
	request: Request,
	context: { params: Promise<{ service: string }> },
) {
	const { service } = await context.params;

	return handleWellKnown(service, request);
}
