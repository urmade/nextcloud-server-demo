import { resetFilesApiStores } from '@/src/server/files/api';
import { resetDavFileStore } from '@/src/server/dav/store';
import { getParityEnv } from '../env';

export async function resetParityFilesStores(): Promise<void> {
	resetDavFileStore();
	resetFilesApiStores();

	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/api/parity/reset-files-store`, {
		method: 'POST',
	});

	if (!response.ok) {
		throw new Error(`Failed to reset Next.js files store (${response.status})`);
	}
}
