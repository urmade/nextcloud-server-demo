import { resetDavFileStore } from '@/src/server/dav/store';
import { resetShareStore } from '@/src/server/files_sharing/store';
import { getParityEnv } from '../env';

// Share records point at file-node ids, so the node store is reset here too:
// a suite that seeds shares must see the same node ids on both sides.
export async function resetParityShareStores(): Promise<void> {
	resetShareStore();
	resetDavFileStore();

	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/api/parity/reset-files-sharing-store`, {
		method: 'POST',
	});

	if (!response.ok) {
		throw new Error(`Failed to reset Next.js files_sharing store (${response.status})`);
	}
}
