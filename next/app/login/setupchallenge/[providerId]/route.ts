import { resolveSession } from '@/src/server/auth/session';
import {
	handleConfirmProviderSetupPost,
	handleSetupProviderGet,
} from '@/src/server/auth/two-factor-challenge';

export async function GET(
	request: Request,
	context: { params: Promise<{ providerId: string }> },
) {
	const { providerId } = await context.params;

	return handleSetupProviderGet(request, resolveSession(request), providerId);
}

export async function POST(
	request: Request,
	context: { params: Promise<{ providerId: string }> },
) {
	const { providerId } = await context.params;

	return handleConfirmProviderSetupPost(request, resolveSession(request), providerId);
}
