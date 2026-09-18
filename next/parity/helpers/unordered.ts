function stableSerialize(value: unknown): string {
	if (value === null || typeof value !== 'object') {
		return JSON.stringify(value);
	}

	if (Array.isArray(value)) {
		const serializedItems = value.map((item) => stableSerialize(item)).sort();
		return `[${serializedItems.join(',')}]`;
	}

	const entries = Object.entries(value as Record<string, unknown>)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([key, nested]) => `${JSON.stringify(key)}:${stableSerialize(nested)}`);

	return `{${entries.join(',')}}`;
}

export function arraysEqualUnordered(left: unknown[], right: unknown[]): boolean {
	if (left.length !== right.length) {
		return false;
	}

	return stableSerialize(left) === stableSerialize(right);
}
