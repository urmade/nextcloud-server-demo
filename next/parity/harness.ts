import { compareParityResponses, snapshotResponse } from './compare';
import { getParityEnv } from './env';
import { fetchLegacyMockSnapshot, hasLegacyMockFixture } from './legacy-mock/adapter';
import type { ParityCompareOptions, ParityMismatch, ParityRequestOptions } from './types';

export interface ParityCaseDefinition {
	name: string;
	path: string;
	options?: ParityRequestOptions;
	compare?: ParityCompareOptions;
}

export interface ParityCaseResult {
	name: string;
	path: string;
	mismatches: ParityMismatch[];
}

function pathOnly(path: string): string {
	return path.split('?')[0];
}

async function fetchHttpSnapshot(baseUrl: string, path: string, options: ParityRequestOptions = {}) {
	const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
	const response = await fetch(url, {
		method: options.method ?? 'GET',
		headers: options.headers,
		body: options.body,
		redirect: 'manual',
	});

	const rawBody = await response.text();

	return snapshotResponse(response, rawBody);
}

async function fetchLegacySnapshot(path: string, options: ParityRequestOptions = {}) {
	const env = getParityEnv();

	if (env.legacyUsesMock && hasLegacyMockFixture(pathOnly(path), options.method ?? 'GET')) {
		return await fetchLegacyMockSnapshot(path, options);
	}

	return fetchHttpSnapshot(env.legacyBaseUrl, path, options);
}

export async function runParityCase(definition: ParityCaseDefinition): Promise<ParityCaseResult> {
	const env = getParityEnv();
	const [legacy, newResponse] = await Promise.all([
		fetchLegacySnapshot(definition.path, definition.options),
		fetchHttpSnapshot(env.newBaseUrl, definition.path, definition.options),
	]);

	const mismatches = compareParityResponses(legacy, newResponse, definition.compare);

	return {
		name: definition.name,
		path: definition.path,
		mismatches,
	};
}

export function formatParityMismatches(mismatches: ParityMismatch[]): string {
	return mismatches
		.map((mismatch) => `${mismatch.path}: ${mismatch.message} (legacy=${JSON.stringify(mismatch.legacy)}, new=${JSON.stringify(mismatch.new)})`)
		.join('\n');
}
