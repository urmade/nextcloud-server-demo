import { resetProvisioningStore } from '@/src/server/provisioning/store';
import { getParityEnv } from '../env';

export async function resetParityProvisioningStores(): Promise<void> {
	resetProvisioningStore();

	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/api/parity/reset-provisioning-store`, {
		method: 'POST',
	});

	if (!response.ok) {
		throw new Error(`Failed to reset Next.js provisioning store (${response.status})`);
	}
}
