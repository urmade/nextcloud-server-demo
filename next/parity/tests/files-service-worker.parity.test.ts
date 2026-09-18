import { afterEach, describe, expect, it } from 'vitest';
import { resetSessionStore } from '@/src/server/auth/session-store';
import { resetDavFileStore } from '@/src/server/dav/store';
import { resetFilesApiStores } from '@/src/server/files/api';
import { getParityEnv } from '../env';
import { compareBinarySnapshots, snapshotBinaryResponse } from '../helpers/binary';
import { fetchLegacyMockSnapshot, hasLegacyMockFixture } from '../legacy-mock/adapter';

const SERVICE_WORKER_PATH = '/apps/files/preview-service-worker.js';

const CONTRACT_HEADERS = [
	'content-type',
	'service-worker-allowed',
	'content-security-policy',
];

async function runServiceWorkerParityCase(definition: {
	name: string;
	options?: { headers?: Record<string, string> };
}) {
	const env = getParityEnv();
	const options = definition.options ?? {};

	const [legacyResponse, newResponse] = await Promise.all([
		fetchLegacyServiceWorkerResponse(options),
		fetch(`${env.newBaseUrl}${SERVICE_WORKER_PATH}`, {
			headers: options.headers,
			redirect: 'manual',
		}),
	]);

	const [legacySnapshot, newSnapshot] = await Promise.all([
		snapshotBinaryResponse(legacyResponse),
		snapshotBinaryResponse(newResponse),
	]);

	const legacyHeaders = Object.fromEntries(legacyResponse.headers.entries());
	const newHeaders = Object.fromEntries(newResponse.headers.entries());

	return {
		name: definition.name,
		path: SERVICE_WORKER_PATH,
		legacyStatus: legacyResponse.status,
		newStatus: newResponse.status,
		mismatches: compareBinarySnapshots(legacySnapshot, newSnapshot, CONTRACT_HEADERS, legacyHeaders, newHeaders),
	};
}

async function fetchLegacyServiceWorkerResponse(options: { headers?: Record<string, string> } = {}) {
	const env = getParityEnv();

	if (env.legacyUsesMock && hasLegacyMockFixture(SERVICE_WORKER_PATH, 'GET')) {
		const snapshot = await fetchLegacyMockSnapshot(SERVICE_WORKER_PATH, options);

		return new Response(snapshot.rawBody, {
			status: snapshot.status,
			headers: snapshot.headers,
		});
	}

	return fetch(`${env.legacyBaseUrl}${SERVICE_WORKER_PATH}`, {
		headers: options.headers,
		redirect: 'manual',
	});
}

describe('parity: files-service-worker', () => {
	afterEach(() => {
		resetSessionStore();
		resetDavFileStore();
		resetFilesApiStores();
	});

	it('GET /apps/files/preview-service-worker.js streams JS without authentication', async () => {
		const result = await runServiceWorkerParityCase({
			name: 'files-service-worker-anonymous',
		});

		expect(result.legacyStatus).toBe(200);
		expect(result.newStatus).toBe(200);
		expect(result.mismatches, result.mismatches.map((m) => m.message).join('\n')).toEqual([]);
	});

	it('GET /apps/files/preview-service-worker.js remains public for authenticated sessions', async () => {
		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}${SERVICE_WORKER_PATH}`, {
			redirect: 'manual',
		});

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')?.split(';')[0].trim()).toBe('application/javascript');
		expect(response.headers.get('service-worker-allowed')).toBe('/');
		expect(response.headers.get('content-security-policy')).toContain("worker-src 'self'");
	});
});
