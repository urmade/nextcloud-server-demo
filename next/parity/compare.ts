import { applyFixtureReplacements, collectValuesAtPaths } from './helpers/fixtures';
import { isIsoTimestamp, timestampsWithinTolerance } from './helpers/timestamps';
import { arraysEqualUnordered } from './helpers/unordered';
import type { ParityCompareOptions, ParityMismatch, ParityResponseSnapshot } from './types';

const DEFAULT_CONTRACT_HEADERS = ['content-type', 'cache-control'];

function normalizeHeaderName(name: string): string {
	return name.toLowerCase();
}

function normalizeHeaderValue(value: string): string {
	return value.trim().replace(/\s+/g, ' ');
}

export function pickContractHeaders(
	headers: Record<string, string>,
	contractHeaders: string[],
	ignoreHeaders: string[] = [],
): Record<string, string> {
	const allowed = new Set(contractHeaders.map(normalizeHeaderName));
	const ignored = new Set(ignoreHeaders.map(normalizeHeaderName));
	const picked: Record<string, string> = {};

	for (const [name, value] of Object.entries(headers)) {
		const normalizedName = normalizeHeaderName(name);

		if (!allowed.has(normalizedName) || ignored.has(normalizedName)) {
			continue;
		}

		picked[normalizedName] = normalizeHeaderValue(value);
	}

	return picked;
}

function parseJsonBody(rawBody: string): unknown {
	const trimmed = rawBody.trim();

	if (!trimmed) {
		return '';
	}

	try {
		return JSON.parse(trimmed);
	} catch {
		return trimmed.replace(/\s+/g, ' ').trim();
	}
}

export function snapshotResponse(response: Response, rawBody: string): ParityResponseSnapshot {
	const headers: Record<string, string> = {};

	response.headers.forEach((value, name) => {
		headers[normalizeHeaderName(name)] = normalizeHeaderValue(value);
	});

	return {
		status: response.status,
		headers,
		body: parseJsonBody(rawBody),
		rawBody,
	};
}

function compareValues(
	path: string,
	legacy: unknown,
	newValue: unknown,
	options: ParityCompareOptions,
	mismatches: ParityMismatch[],
): void {
	if (options.unorderedListPaths?.includes(path)) {
		if (!Array.isArray(legacy) || !Array.isArray(newValue)) {
			mismatches.push({
				path,
				legacy,
				new: newValue,
				message: 'Expected arrays for unordered list comparison',
			});
			return;
		}

		if (!arraysEqualUnordered(legacy, newValue)) {
			mismatches.push({
				path,
				legacy,
				new: newValue,
				message: 'Unordered list values differ',
			});
		}

		return;
	}

	if (options.timestampPaths?.includes(path)) {
		if (!isIsoTimestamp(legacy) || !isIsoTimestamp(newValue)) {
			mismatches.push({
				path,
				legacy,
				new: newValue,
				message: 'Expected ISO timestamps at configured path',
			});
			return;
		}

		const toleranceMs = options.timestampToleranceMs ?? 5_000;

		if (!timestampsWithinTolerance(legacy, newValue, toleranceMs)) {
			mismatches.push({
				path,
				legacy,
				new: newValue,
				message: `Timestamps differ by more than ${toleranceMs}ms`,
			});
		}

		return;
	}

	if (Array.isArray(legacy) && Array.isArray(newValue)) {
		if (legacy.length !== newValue.length) {
			mismatches.push({
				path,
				legacy,
				new: newValue,
				message: 'Array lengths differ',
			});
			return;
		}

		for (let index = 0; index < legacy.length; index += 1) {
			compareValues(`${path}[${index}]`, legacy[index], newValue[index], options, mismatches);
		}

		return;
	}

	if (legacy !== null && typeof legacy === 'object' && newValue !== null && typeof newValue === 'object') {
		const legacyRecord = legacy as Record<string, unknown>;
		const newRecord = newValue as Record<string, unknown>;
		const keys = new Set([...Object.keys(legacyRecord), ...Object.keys(newRecord)]);

		for (const key of keys) {
			const childPath = path ? `${path}.${key}` : key;
			compareValues(childPath, legacyRecord[key], newRecord[key], options, mismatches);
		}

		return;
	}

	if (legacy !== newValue) {
		mismatches.push({
			path,
			legacy,
			new: newValue,
			message: 'Values differ',
		});
	}
}

export function compareParityResponses(
	legacy: ParityResponseSnapshot,
	newResponse: ParityResponseSnapshot,
	options: ParityCompareOptions = {},
): ParityMismatch[] {
	const mismatches: ParityMismatch[] = [];
	const contractHeaders = options.contractHeaders ?? DEFAULT_CONTRACT_HEADERS;

	if (legacy.status !== newResponse.status) {
		mismatches.push({
			path: 'status',
			legacy: legacy.status,
			new: newResponse.status,
			message: 'HTTP status codes differ',
		});
	}

	const legacyHeaders = pickContractHeaders(legacy.headers, contractHeaders, options.ignoreHeaders);
	const newHeaders = pickContractHeaders(newResponse.headers, contractHeaders, options.ignoreHeaders);
	const headerNames = new Set([...Object.keys(legacyHeaders), ...Object.keys(newHeaders)]);

	for (const headerName of headerNames) {
		if (legacyHeaders[headerName] !== newHeaders[headerName]) {
			mismatches.push({
				path: `headers.${headerName}`,
				legacy: legacyHeaders[headerName] ?? null,
				new: newHeaders[headerName] ?? null,
				message: 'Contract header values differ',
			});
		}
	}

	let legacyBody = legacy.body;
	let newBody = newResponse.body;

	if (options.fixtures) {
		legacyBody = applyFixtureReplacements(legacyBody, options.fixtures);
		newBody = applyFixtureReplacements(newBody, options.fixtures);
	}

	if (options.unstableIdPaths?.length) {
		const fixtureMap: Record<string, unknown> = {};

		for (const path of options.unstableIdPaths) {
			fixtureMap[path] = '<unstable-id>';
		}

		legacyBody = applyFixtureReplacements(legacyBody, fixtureMap);
		newBody = applyFixtureReplacements(newBody, fixtureMap);
	}

	if (options.timestampPaths?.length) {
		const toleranceMs = options.timestampToleranceMs ?? 5_000;
		const legacyTimestamps = collectValuesAtPaths(legacyBody, options.timestampPaths);
		const newTimestamps = collectValuesAtPaths(newBody, options.timestampPaths);

		for (const path of options.timestampPaths) {
			const legacyTimestamp = legacyTimestamps.get(path);
			const newTimestamp = newTimestamps.get(path);

			if (legacyTimestamp === undefined && newTimestamp === undefined) {
				continue;
			}

			if (!isIsoTimestamp(legacyTimestamp) || !isIsoTimestamp(newTimestamp)) {
				mismatches.push({
					path,
					legacy: legacyTimestamp,
					new: newTimestamp,
					message: 'Expected ISO timestamps at configured path',
				});
				continue;
			}

			if (!timestampsWithinTolerance(legacyTimestamp, newTimestamp, toleranceMs)) {
				mismatches.push({
					path,
					legacy: legacyTimestamp,
					new: newTimestamp,
					message: `Timestamps differ by more than ${toleranceMs}ms`,
				});
			}
		}

		const timestampFixtureMap = Object.fromEntries(
			options.timestampPaths.map((path) => [path, '<timestamp>']),
		);

		legacyBody = applyFixtureReplacements(legacyBody, timestampFixtureMap);
		newBody = applyFixtureReplacements(newBody, timestampFixtureMap);
	}

	compareValues('body', legacyBody, newBody, options, mismatches);

	return mismatches;
}
