import { describe, expect, it } from 'vitest';
import { formatParityMismatches, runParityCase } from '../harness';

describe('parity: health endpoints', () => {
	it('GET /api/health matches legacy contract', async () => {
		const result = await runParityCase({
			name: 'health',
			path: '/api/health',
			compare: {
				contractHeaders: ['content-type', 'cache-control'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /api/ready matches legacy contract', async () => {
		const result = await runParityCase({
			name: 'ready',
			path: '/api/ready',
			compare: {
				contractHeaders: ['content-type', 'cache-control'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});
