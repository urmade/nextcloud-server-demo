import { findParityUser } from '@/src/server/config/users';
import {
	ocsForbiddenResponse,
	ocsNotFoundNullResponse,
	ocsSuccessResponse,
	parseOcsVersion,
} from '@/src/server/ocs/respond';
import { requireAdminUser } from '@/src/server/ocs/admin-auth';
import { registerFixtureWebAuthnCredential } from '@/src/server/auth/webauthn-store';
import { FIXTURE_CREDENTIAL_ID } from '@/src/server/auth/webauthn';

interface ParityRegisterRequest {
	user?: string;
}

function isParityWebAuthnEnabled(): boolean {
	const value = process.env.NC_PARITY_WEBAUTHN_PROVIDER?.trim().toLowerCase();

	return value !== 'false';
}

export async function handleWebAuthnParityRegister(request: Request): Promise<Response> {
	const ocsVersion = parseOcsVersion(request);

	if (!isParityWebAuthnEnabled()) {
		return ocsForbiddenResponse(ocsVersion, 'WebAuthn parity provider disabled', {});
	}

	const admin = requireAdminUser(request);

	if (admin instanceof Response) {
		return admin;
	}

	const body = await request.json().catch(() => null) as ParityRegisterRequest | null;
	const targetUserId = body?.user?.trim() ?? '';

	if (!targetUserId || !findParityUser(targetUserId)) {
		return ocsNotFoundNullResponse(ocsVersion);
	}

	registerFixtureWebAuthnCredential(targetUserId, FIXTURE_CREDENTIAL_ID, true);

	return ocsSuccessResponse({ registered: true }, ocsVersion);
}
