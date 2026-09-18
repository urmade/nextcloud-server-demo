import { setParityDefaultPhoneRegion as setLocalDefaultPhoneRegion } from '@/src/server/provisioning/config';
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

export async function setParityDefaultPhoneRegion(region: string | null): Promise<void> {
	setLocalDefaultPhoneRegion(region);

	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/api/parity/set-provisioning-config`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
		},
		body: JSON.stringify({ defaultPhoneRegion: region }),
	});

	if (!response.ok) {
		throw new Error(`Failed to set Next.js provisioning config (${response.status})`);
	}
}
