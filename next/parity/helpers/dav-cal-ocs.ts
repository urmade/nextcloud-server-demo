import { resetCalOcsStore } from '@/src/server/dav/cal-ocs-store';
import { getParityEnv } from '../env';

export async function resetParityCalOcsStores(): Promise<void> {
	resetCalOcsStore();

	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/api/parity/reset-dav-cal-ocs-store`, {
		method: 'POST',
	});

	if (!response.ok && response.status !== 404) {
		throw new Error(`Failed to reset cal-ocs store on the Next.js server (${response.status})`);
	}
}
