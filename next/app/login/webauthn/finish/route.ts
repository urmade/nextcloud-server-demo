import { resolveSession } from '@/src/server/auth/session';
import { handleWebAuthnFinish } from '@/src/server/auth/webauthn';

export async function POST(request: Request) {
	const body = await request.text();

	return handleWebAuthnFinish(request, resolveSession(request), body);
}
