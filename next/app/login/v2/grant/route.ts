import { handleLoginFlowV2GrantPage, handleLoginFlowV2GrantPost } from '@/src/server/auth/login-flow-v2';
import { resolveSession } from '@/src/server/auth/session';

export async function GET(request: Request) {
	const url = new URL(request.url);
	const stateToken = url.searchParams.get('stateToken');

	return handleLoginFlowV2GrantPage(request, resolveSession(request), stateToken);
}

export async function POST(request: Request) {
	const body = await request.text();

	return handleLoginFlowV2GrantPost(request, resolveSession(request), body);
}
