import { resetShareStore } from '@/src/server/files_sharing/store';
import { getParityEnv } from '../env';

export async function resetParityShareStores(): Promise<void> {
	resetShareStore();

	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/api/parity/reset-files-sharing-store`, {
		method: 'POST',
	});

	if (!response.ok) {
		throw new Error(`Failed to reset Next.js files_sharing store (${response.status})`);
	}
}
