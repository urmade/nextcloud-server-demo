import { handleCheckWipe, handleWipeDone } from '@/src/server/wipe/api';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';
import { snapshotResponse } from '../compare';

function buildRequest(pathname: string, options: ParityRequestOptions): Request {
	const origin = 'http://127.0.0.1:3100';

	return new Request(`${origin}${pathname}`, {
		method: options.method ?? 'POST',
		headers: options.headers ?? {},
		body: options.body,
	});
}

async function responseToSnapshot(response: Response): Promise<ParityResponseSnapshot> {
	const rawBody = await response.text();

	return snapshotResponse(response, rawBody);
}

export async function handleWipeMock(
	pathname: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	const method = (options.method ?? 'GET').toUpperCase();

	if (method !== 'POST') {
		return null;
	}

	if (pathname === '/index.php/core/wipe/check' || pathname === '/core/wipe/check') {
		return responseToSnapshot(await handleCheckWipe(buildRequest(pathname, options)));
	}

	if (pathname === '/index.php/core/wipe/success' || pathname === '/core/wipe/success') {
		return responseToSnapshot(await handleWipeDone(buildRequest(pathname, options)));
	}

	return null;
}
