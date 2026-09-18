const ISO_TIMESTAMP_PATTERN =
	/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export function isIsoTimestamp(value: unknown): value is string {
	return typeof value === 'string' && ISO_TIMESTAMP_PATTERN.test(value);
}

export function parseIsoTimestamp(value: string): number {
	const parsed = Date.parse(value);

	if (Number.isNaN(parsed)) {
		throw new Error(`Invalid ISO timestamp: ${value}`);
	}

	return parsed;
}

export function timestampsWithinTolerance(
	legacy: string,
	newValue: string,
	toleranceMs: number,
): boolean {
	return Math.abs(parseIsoTimestamp(legacy) - parseIsoTimestamp(newValue)) <= toleranceMs;
}
