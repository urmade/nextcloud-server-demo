import { resetPrincipalsStore } from '@/src/server/dav/principals-store';
import { getParityEnv } from '../env';

export async function resetParityPrincipalsStores(): Promise<void> {
	resetPrincipalsStore();

	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/api/parity/reset-dav-principals-store`, {
		method: 'POST',
	});

	if (!response.ok) {
		throw new Error(`Failed to reset DAV principals store: ${response.status}`);
	}
}
