import { resolveSession } from '@/src/server/auth/session';
import { handleWebAuthnStart } from '@/src/server/auth/webauthn';

export async function POST(request: Request) {
	const body = await request.text();

	return handleWebAuthnStart(request, resolveSession(request), body);
}
