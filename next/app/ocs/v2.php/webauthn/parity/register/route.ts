import { handleWebAuthnParityRegister } from '@/src/server/webauthn/parity-api';

export async function POST(request: Request) {
	return await handleWebAuthnParityRegister(request);
}
