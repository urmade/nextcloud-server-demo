import { resetExampleContentStore } from '@/src/server/dav/example-content-store';
import { getParityEnv } from '../env';

export async function resetParityExampleContentStores(): Promise<void> {
	resetExampleContentStore();

	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/api/parity/reset-dav-example-content-store`, {
		method: 'POST',
	});

	if (!response.ok && response.status !== 404) {
		throw new Error(`Failed to reset example content store on the Next.js server (${response.status})`);
	}
}
