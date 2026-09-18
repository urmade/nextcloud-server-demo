import { resolveSession } from '@/src/server/auth/session';
import { handleSetupProvidersGet } from '@/src/server/auth/two-factor-challenge';

export async function GET(request: Request) {
	return handleSetupProvidersGet(request, resolveSession(request));
}
