import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDefaultContentSecurityPolicy } from '@/src/server/http/content-security-policy';
import { binaryResponse } from '@/src/server/http/binary';

const SERVICE_WORKER_PATH = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../../../dist/preview-service-worker.js',
);

let cachedServiceWorkerBytes: Buffer | null = null;

function loadServiceWorkerBytes(): Buffer {
	if (!cachedServiceWorkerBytes) {
		cachedServiceWorkerBytes = readFileSync(SERVICE_WORKER_PATH);
	}

	return cachedServiceWorkerBytes;
}

export function getServiceWorkerResponse(): Response {
	const bytes = loadServiceWorkerBytes();

	return binaryResponse(bytes, 200, 'application/javascript', {
		'Service-Worker-Allowed': '/',
		'Content-Security-Policy': buildDefaultContentSecurityPolicy(),
	});
}
