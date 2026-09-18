import { handleLoginFlowV2Init } from '@/src/server/auth/login-flow-v2';
import { resolveSession } from '@/src/server/auth/session';

export async function POST(request: Request) {
	return handleLoginFlowV2Init(request, resolveSession(request));
}
