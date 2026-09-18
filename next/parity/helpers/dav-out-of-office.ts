import { resetOutOfOfficeStore } from '@/src/server/dav/out-of-office-store';
import { getParityEnv } from '../env';

export async function resetParityOutOfOfficeStores(): Promise<void> {
	resetOutOfOfficeStore();

	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/api/parity/reset-dav-out-of-office-store`, {
		method: 'POST',
	});

	if (!response.ok && response.status !== 404) {
		throw new Error(`Failed to reset out-of-office store on the Next.js server (${response.status})`);
	}
}
