import { resetTreeExtrasStore } from '@/src/server/dav/tree-extras-store';
import { getParityEnv } from '../env';

export async function resetParityTreeExtrasStores(): Promise<void> {
	resetTreeExtrasStore();

	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/api/parity/reset-dav-tree-extras-store`, {
		method: 'POST',
	});

	if (!response.ok) {
		throw new Error(`Failed to reset DAV tree-extras store: ${response.status}`);
	}
}
