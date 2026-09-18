import { describe, expect, it } from 'vitest';
import { getHealthPayload, getReadyPayload } from './health';

describe('health server module', () => {
	it('returns stable health payload', () => {
		expect(getHealthPayload()).toEqual({
			status: 'ok',
			service: 'nextcloud-next',
		});
	});

	it('returns stable ready payload', () => {
		expect(getReadyPayload()).toEqual({
			ready: true,
			service: 'nextcloud-next',
		});
	});
});
