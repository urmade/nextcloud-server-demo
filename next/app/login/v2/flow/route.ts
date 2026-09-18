import { handleLoginFlowV2ShowAuthPicker } from '@/src/server/auth/login-flow-v2';
import { resolveSession } from '@/src/server/auth/session';

export async function GET(request: Request) {
	const url = new URL(request.url);
	const user = url.searchParams.get('user') ?? '';
	const direct = Number.parseInt(url.searchParams.get('direct') ?? '0', 10);

	return handleLoginFlowV2ShowAuthPicker(request, resolveSession(request), user, direct);
}
