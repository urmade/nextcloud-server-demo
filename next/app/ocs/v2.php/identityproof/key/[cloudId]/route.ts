import { handleOcsGetIdentityProof } from '@/src/server/ocs/public-leftovers';

export async function GET(
	request: Request,
	context: { params: Promise<{ cloudId: string }> },
) {
	const { cloudId } = await context.params;

	return await handleOcsGetIdentityProof(request, cloudId);
}
