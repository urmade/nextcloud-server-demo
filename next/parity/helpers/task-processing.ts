import { getParityEnv } from '../env';
import { resetTaskStore } from '@/src/server/task-processing/store';

export async function resetParityTaskStores(): Promise<void> {
	resetTaskStore();

	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/api/parity/reset-task-store`, {
		method: 'POST',
	});

	if (!response.ok && response.status !== 404) {
		throw new Error(`Failed to reset Next.js task store (${response.status})`);
	}
}
