import { handleLoginFlowV2Landing } from '@/src/server/auth/login-flow-v2';
import { resolveSession } from '@/src/server/auth/session';

export async function GET(
	request: Request,
	context: { params: Promise<{ token: string }> },
) {
	const { token } = await context.params;
	const url = new URL(request.url);
	const user = url.searchParams.get('user') ?? '';
	const direct = Number.parseInt(url.searchParams.get('direct') ?? '0', 10);

	return handleLoginFlowV2Landing(request, resolveSession(request), token, user, direct);
}
