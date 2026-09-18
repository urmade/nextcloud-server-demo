import { describe, expect, it } from 'vitest';
import { classifyBinarySize, compareBinarySnapshots } from './binary';

describe('binary parity helpers', () => {
	it('classifies payload sizes', () => {
		expect(classifyBinarySize(0)).toBe('empty');
		expect(classifyBinarySize(70)).toBe('small');
		expect(classifyBinarySize(2048)).toBe('medium');
		expect(classifyBinarySize(128 * 1024)).toBe('large');
	});

	it('compares binary snapshots by size class instead of exact bytes', () => {
		const mismatches = compareBinarySnapshots(
			{
				status: 200,
				contentType: 'image/png',
				sizeClass: 'small',
				bodyLength: 70,
			},
			{
				status: 200,
				contentType: 'image/png',
				sizeClass: 'small',
				bodyLength: 68,
			},
		);

		expect(mismatches).toEqual([]);
	});
});
