import { resetCredentialOverrides } from '@/src/server/auth/credentials';
import { resetLostPasswordStore } from '@/src/server/auth/lost-password-store';
import { resetSessionStore } from '@/src/server/auth/session-store';
import { resetTwoFactorStore } from '@/src/server/two-factor/store';
import { getParityEnv } from '../env';
import { resetLegacyMockAuth } from '../legacy-mock/auth';

// A password reset leaves an override on the server that survives every later
// login, so the credential and lost-password stores are reset here as well.
export async function resetParityAuthStores(): Promise<void> {
	resetSessionStore();
	resetTwoFactorStore();
	resetCredentialOverrides();
	resetLostPasswordStore();
	resetLegacyMockAuth();

	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/api/parity/reset-auth-store`, {
		method: 'POST',
	});

	if (!response.ok) {
		throw new Error(`Failed to reset Next.js auth store (${response.status})`);
	}
}
