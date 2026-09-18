import { resetExternalShareStore, seedParityExternalShare } from '@/src/server/files_sharing/external-share-store';
import { resetShareStore } from '@/src/server/files_sharing/store';
import type { ExternalShareRecord } from '@/src/server/files_sharing/types';
import { getParityEnv } from '../env';

export async function resetParityShareStores(): Promise<void> {
	resetShareStore();
	resetExternalShareStore();

	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/api/parity/reset-files-sharing-store`, {
		method: 'POST',
	});

	if (!response.ok) {
		throw new Error(`Failed to reset Next.js files_sharing store (${response.status})`);
	}
}

export async function seedExternalShareOnBothSides(
	input: Omit<ExternalShareRecord, 'id'> & { id?: string },
): Promise<ExternalShareRecord> {
	const share = seedParityExternalShare(input);
	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/api/parity/seed-external-share`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
		},
		body: JSON.stringify(input),
	});

	if (!response.ok) {
		throw new Error(`Failed to seed Next.js external share store (${response.status})`);
	}

	return share;
}
