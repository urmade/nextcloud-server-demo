function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getByPath(value: unknown, path: string): unknown {
	const segments = path.split('.').filter(Boolean);
	let current: unknown = value;

	for (const segment of segments) {
		if (!isPlainObject(current) && !Array.isArray(current)) {
			return undefined;
		}

		if (Array.isArray(current)) {
			const index = Number(segment);

			if (!Number.isInteger(index)) {
				return undefined;
			}

			current = current[index];
			continue;
		}

		current = current[segment];
	}

	return current;
}

function setByPath(value: unknown, path: string, replacement: unknown): void {
	const segments = path.split('.').filter(Boolean);

	if (segments.length === 0) {
		return;
	}

	let current: unknown = value;

	for (let index = 0; index < segments.length - 1; index += 1) {
		const segment = segments[index];

		if (!isPlainObject(current) && !Array.isArray(current)) {
			return;
		}

		if (Array.isArray(current)) {
			const arrayIndex = Number(segment);

			if (!Number.isInteger(arrayIndex)) {
				return;
			}

			current = current[arrayIndex];
			continue;
		}

		current = current[segment];
	}

	const lastSegment = segments[segments.length - 1];

	if (Array.isArray(current)) {
		const arrayIndex = Number(lastSegment);

		if (Number.isInteger(arrayIndex)) {
			current[arrayIndex] = replacement;
		}

		return;
	}

	if (isPlainObject(current)) {
		current[lastSegment] = replacement;
	}
}

export function applyFixtureReplacements(
	value: unknown,
	fixtures: Record<string, unknown>,
): unknown {
	const clone = structuredClone(value);

	for (const [path, replacement] of Object.entries(fixtures)) {
		setByPath(clone, path, replacement);
	}

	return clone;
}

export function collectValuesAtPaths(value: unknown, paths: string[]): Map<string, unknown> {
	const collected = new Map<string, unknown>();

	for (const path of paths) {
		collected.set(path, getByPath(value, path));
	}

	return collected;
}
