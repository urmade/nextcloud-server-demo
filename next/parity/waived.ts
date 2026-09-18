import { it } from 'vitest';
import type { ParityWaived } from './types';

export function parityWaived(
	title: string,
	waiver: ParityWaived,
	testFn: () => void | Promise<void>,
): void {
	it.skip(`parity:waived ${title} | reason=${waiver.reason} | owner=${waiver.owner}`, testFn);
}
