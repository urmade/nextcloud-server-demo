import { handleLoginFlowV2ApptokenPost } from '@/src/server/auth/login-flow-v2';
import { resolveSession } from '@/src/server/auth/session';

export async function POST(request: Request) {
	const body = await request.text();

	return handleLoginFlowV2ApptokenPost(request, resolveSession(request), body);
}
