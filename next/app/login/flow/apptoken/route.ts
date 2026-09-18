import { handleLoginFlowV1ApptokenPost } from '@/src/server/auth/login-flow-v1';
import { resolveSession } from '@/src/server/auth/session';

export async function POST(request: Request) {
	const body = await request.text();

	return handleLoginFlowV1ApptokenPost(request, resolveSession(request), body);
}
