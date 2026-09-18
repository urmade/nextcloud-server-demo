import { resetCredentialOverrides } from '@/src/server/auth/credentials';
import { resetSessionStore } from '@/src/server/auth/session-store';
import { resetTwoFactorStore } from '@/src/server/two-factor/store';

export async function POST() {
	if (process.env.NC_PARITY_EXAPP !== 'true') {
		return new Response(null, { status: 404 });
	}

	resetSessionStore();
	resetTwoFactorStore();
	resetCredentialOverrides();

	return new Response(null, { status: 204 });
}
