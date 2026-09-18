import { handleLoginFlowV2Poll } from '@/src/server/auth/login-flow-v2';
import { resolveSession } from '@/src/server/auth/session';

export async function POST(request: Request) {
	return handleLoginFlowV2Poll(request, resolveSession(request));
}
