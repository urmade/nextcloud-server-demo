import { resolveSession } from '@/src/server/auth/session';
import {
	FIXTURE_ASSERTION_DATA,
	handleWebAuthnFinish,
	handleWebAuthnStart,
} from '@/src/server/auth/webauthn';
import { handleWebAuthnParityRegister } from '@/src/server/webauthn/parity-api';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';
import { snapshotResponse } from '../compare';

function buildRequest(pathname: string, options: ParityRequestOptions): Request {
	const origin = 'http://127.0.0.1:3100';

	return new Request(`${origin}${pathname}`, {
		method: options.method ?? 'GET',
		headers: options.headers ?? {},
		body: options.body,
	});
}

async function responseToSnapshot(response: Response): Promise<ParityResponseSnapshot> {
	const rawBody = await response.text();

	return snapshotResponse(response, rawBody);
}

export async function handleWebAuthnMock(
	pathname: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	const method = (options.method ?? 'GET').toUpperCase();

	if (method === 'POST' && pathname === '/ocs/v2.php/webauthn/parity/register') {
		return responseToSnapshot(await handleWebAuthnParityRegister(buildRequest(pathname, options)));
	}

	if (method === 'POST' && pathname === '/login/webauthn/start') {
		const request = buildRequest(pathname, options);

		return responseToSnapshot(
			handleWebAuthnStart(
				request,
				resolveSession(request),
				typeof options.body === 'string' ? options.body : '',
			),
		);
	}

	if (method === 'POST' && pathname === '/login/webauthn/finish') {
		const request = buildRequest(pathname, options);

		return responseToSnapshot(
			handleWebAuthnFinish(
				request,
				resolveSession(request),
				typeof options.body === 'string' ? options.body : '',
			),
		);
	}

	return null;
}

export function isWebAuthnPath(pathname: string): boolean {
	return pathname === '/login/webauthn/start'
		|| pathname === '/login/webauthn/finish'
		|| pathname === '/ocs/v2.php/webauthn/parity/register';
}

export { FIXTURE_ASSERTION_DATA };
