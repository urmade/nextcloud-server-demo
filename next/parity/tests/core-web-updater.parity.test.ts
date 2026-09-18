import { afterEach, describe, expect, it } from 'vitest';
import { getParityEnv } from '../env';
import {
	parseSseEventTypes,
	resetParityWebUpdaterConfig,
	setParityWebUpdaterConfig,
} from '../helpers/web-updater';
import { OCS_JSON_HEADERS } from '../helpers/session';

async function fetchUpdateStream(envKey: 'legacyBaseUrl' | 'newBaseUrl'): Promise<{
	status: number;
	contentType: string;
	eventTypes: string[];
	rawBody: string;
}> {
	const env = getParityEnv();
	const response = await fetch(`${env[envKey]}/ocs/v2.php/core/update?format=json`, {
		headers: OCS_JSON_HEADERS,
		redirect: 'manual',
	});
	const rawBody = await response.text();

	return {
		status: response.status,
		contentType: response.headers.get('content-type') ?? '',
		eventTypes: parseSseEventTypes(rawBody),
		rawBody,
	};
}

describe('parity: core web updater', () => {
	afterEach(async () => {
		await resetParityWebUpdaterConfig();
	});

	it('GET /ocs/v2.php/core/update already-current streams notice + done (core.Update#update)', async () => {
		const [legacy, newSide] = await Promise.all([
			fetchUpdateStream('legacyBaseUrl'),
			fetchUpdateStream('newBaseUrl'),
		]);

		expect(legacy.status).toBe(200);
		expect(newSide.status).toBe(200);
		expect(legacy.contentType).toContain('text/event-stream');
		expect(newSide.contentType).toContain('text/event-stream');
		expect(legacy.eventTypes).toEqual(newSide.eventTypes);
		expect(newSide.eventTypes).toContain('notice');
		expect(newSide.eventTypes).toContain('done');
	});

	it('GET /ocs/v2.php/core/update disable-web streams failure (core.Update#update)', async () => {
		await setParityWebUpdaterConfig({
			needsUpgrade: true,
			disableWeb: true,
		});

		const [legacy, newSide] = await Promise.all([
			fetchUpdateStream('legacyBaseUrl'),
			fetchUpdateStream('newBaseUrl'),
		]);

		expect(legacy.status).toBe(200);
		expect(newSide.status).toBe(200);
		expect(legacy.contentType).toContain('text/event-stream');
		expect(newSide.contentType).toContain('text/event-stream');
		expect(legacy.eventTypes).toEqual(newSide.eventTypes);
		expect(newSide.eventTypes).toContain('failure');
		expect(newSide.eventTypes).not.toContain('done');
	});
});
