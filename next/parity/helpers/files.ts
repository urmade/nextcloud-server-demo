import { resetDavFileStore } from '@/src/server/dav/store';
import { resetFilesApiStores } from '@/src/server/files/api';
import { getParityEnv } from '../env';

// The DAV file store owns the file-node id counter, so it has to be reset with
// the files stores: the legacy mock runs in-process and shares this module
// state, while the Next.js server keeps its own copy behind the reset route.
export async function resetParityFilesStores(): Promise<void> {
	resetFilesApiStores();
	resetDavFileStore();

	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/api/parity/reset-files-store`, {
		method: 'POST',
	});

	if (!response.ok) {
		throw new Error(`Failed to reset Next.js files store (${response.status})`);
	}
}
