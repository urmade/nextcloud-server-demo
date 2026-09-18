import { beforeAll } from 'vitest';

beforeAll(() => {
	if (!process.env.NEW_BASE_URL?.trim()) {
		throw new Error('NEW_BASE_URL must be set for parity tests (see parity/tests/global-setup.ts)');
	}
});
