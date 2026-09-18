import { beforeAll } from 'vitest';
import { getParityEnv } from '../env';

beforeAll(() => {
	const env = getParityEnv();

	if (!env.legacyBaseUrl || !env.newBaseUrl) {
		throw new Error('LEGACY_BASE_URL and NEW_BASE_URL must be set for parity tests');
	}
});
