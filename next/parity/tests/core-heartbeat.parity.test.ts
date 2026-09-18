import { describe, expect, it } from 'vitest';
import { getParityEnv } from '../env';
import { fetchLegacyMockSnapshot } from '../legacy-mock/adapter';
import { formatParityMismatches, runParityCase } from '../harness';

const EMPTY_COMPARE = {
	contractHeaders: [] as string[],
};

describe('parity: core-heartbeat', () => {
	it('GET /heartbeat returns empty 200', async () => {
		const result = await runParityCase({
			name: 'heartbeat-happy',
			path: '/heartbeat',
			compare: EMPTY_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/heartbeat`, { redirect: 'manual' });
		const body = await response.text();

		expect(response.status).toBe(200);
		expect(body).toBe('');
	});

	it('GET /index.php/heartbeat matches pretty twin', async () => {
		const result = await runParityCase({
			name: 'heartbeat-index-php-twin',
			path: '/index.php/heartbeat',
			compare: EMPTY_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const legacy = await fetchLegacyMockSnapshot('/index.php/heartbeat');
		const response = await fetch(`${env.newBaseUrl}/index.php/heartbeat`, { redirect: 'manual' });

		expect(legacy.status).toBe(200);
		expect(response.status).toBe(200);
		expect(legacy.rawBody).toBe('');
		expect(await response.text()).toBe('');
	});
});
