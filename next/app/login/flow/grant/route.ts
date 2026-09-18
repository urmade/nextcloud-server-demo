import { handleLoginFlowV1GrantPage } from '@/src/server/auth/login-flow-v1';
import { resolveSession } from '@/src/server/auth/session';

export async function GET(request: Request) {
	const url = new URL(request.url);
	const stateToken = url.searchParams.get('stateToken');
	const clientIdentifier = url.searchParams.get('clientIdentifier') ?? '';

	return handleLoginFlowV1GrantPage(request, resolveSession(request), stateToken, clientIdentifier);
}
