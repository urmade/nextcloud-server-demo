import { resetCredentialOverrides } from '@/src/server/auth/credentials';
import { resetSessionStore } from '@/src/server/auth/session-store';
import { resetTwoFactorStore } from '@/src/server/two-factor/store';
import { getParityEnv } from '../env';
import { resetLegacyMockAuth } from '../legacy-mock/auth';

export async function resetParityAuthStores(): Promise<void> {
	resetSessionStore();
	resetTwoFactorStore();
	resetCredentialOverrides();
	resetLegacyMockAuth();

	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/api/parity/reset-auth-store`, {
		method: 'POST',
	});

	if (!response.ok) {
		throw new Error(`Failed to reset Next.js auth store (${response.status})`);
	}
}
