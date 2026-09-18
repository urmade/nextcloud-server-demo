import { afterEach, describe, expect, it } from 'vitest';
import { buildWebUpdaterEvents } from './web-updater';
import {
	resetParityWebUpdaterRuntimeConfig,
	setParityWebUpdaterRuntimeConfig,
} from './web-updater-config';

describe('web-updater', () => {
	afterEach(() => {
		resetParityWebUpdaterRuntimeConfig();
	});

	it('already-current emits notice and done', () => {
		setParityWebUpdaterRuntimeConfig({ needsUpgrade: false });

		const events = buildWebUpdaterEvents();

		expect(events.map((event) => event.type)).toEqual([
			'success',
			'notice',
			'done',
			'__internal__',
		]);
		expect(events[1]?.data).toBe('Already up to date');
	});

	it('disable-web emits failure when upgrade is needed', () => {
		setParityWebUpdaterRuntimeConfig({ needsUpgrade: true, disableWeb: true });

		const events = buildWebUpdaterEvents();

		expect(events.map((event) => event.type)).toEqual([
			'success',
			'failure',
			'__internal__',
		]);
	});
});
