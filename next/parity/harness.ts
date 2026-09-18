import { compareParityResponses, snapshotResponse } from './compare';
import { getParityEnv } from './env';
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

async function fetchSnapshot(baseUrl: string, path: string, options: ParityRequestOptions = {}) {
	const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
	const response = await fetch(url, {
		method: options.method ?? 'GET',
		headers: options.headers,
		body: options.body,
	});

	const rawBody = await response.text();

	return snapshotResponse(response, rawBody);
}

export async function runParityCase(definition: ParityCaseDefinition): Promise<ParityCaseResult> {
	const env = getParityEnv();
	const [legacy, newResponse] = await Promise.all([
		fetchSnapshot(env.legacyBaseUrl, definition.path, definition.options),
		fetchSnapshot(env.newBaseUrl, definition.path, definition.options),
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
