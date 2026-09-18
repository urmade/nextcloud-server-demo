import {
	handleOcsGetConfig,
	handleOcsGetIdentityProof,
	handleOcsPersonCheck,
	handleOpenMetricsExport,
} from '@/src/server/ocs/public-leftovers';
import { snapshotResponse } from '../compare';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';

function buildRequest(pathname: string, search: string, options: ParityRequestOptions): Request {
	const origin = 'http://127.0.0.1:3100';

	return new Request(`${origin}${pathname}${search ? `?${search}` : ''}`, {
		method: options.method ?? 'GET',
		headers: options.headers ?? {},
		body: options.body,
	});
}

async function responseToSnapshot(response: Response): Promise<ParityResponseSnapshot> {
	const rawBody = await response.text();

	return snapshotResponse(response, rawBody);
}

const IDENTITY_PROOF_PATH = /^\/ocs\/v2\.php\/identityproof\/key\/([^/]+)$/;

export async function handlePublicLeftoversMock(
	pathname: string,
	search: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	const method = (options.method ?? 'GET').toUpperCase();
	const request = buildRequest(pathname, search, options);

	if (method === 'GET' && pathname === '/ocs/v2.php/config') {
		return responseToSnapshot(await handleOcsGetConfig(request));
	}

	if (method === 'POST' && pathname === '/ocs/v2.php/person/check') {
		return responseToSnapshot(await handleOcsPersonCheck(request));
	}

	const identityProofMatch = IDENTITY_PROOF_PATH.exec(pathname);

	if (method === 'GET' && identityProofMatch) {
		return responseToSnapshot(await handleOcsGetIdentityProof(request, identityProofMatch[1]));
	}

	if (method === 'GET' && pathname === '/metrics') {
		return responseToSnapshot(handleOpenMetricsExport(request));
	}

	return null;
}

export function isPublicLeftoversMockPath(pathname: string, method = 'GET'): boolean {
	const normalizedMethod = method.toUpperCase();

	if (normalizedMethod === 'GET' && (pathname === '/ocs/v2.php/config' || pathname === '/metrics')) {
		return true;
	}

	if (normalizedMethod === 'POST' && pathname === '/ocs/v2.php/person/check') {
		return true;
	}

	return normalizedMethod === 'GET' && IDENTITY_PROOF_PATH.test(pathname);
}
