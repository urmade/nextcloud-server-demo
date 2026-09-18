import {
	handleLostPasswordEmail,
	handleLostPasswordResetForm,
	handleLostPasswordSetPassword,
} from '@/src/server/auth/lost-password';
import { snapshotResponse } from '../compare';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';

function buildRequest(pathname: string, options: ParityRequestOptions): Request {
	const method = (options.method ?? 'GET').toUpperCase();

	return new Request(`http://127.0.0.1:3100${pathname}`, {
		method,
		headers: options.headers,
		body: options.body,
	});
}

async function responseToSnapshot(response: Response): Promise<ParityResponseSnapshot> {
	const rawBody = await response.text();

	return snapshotResponse(response, rawBody);
}

export async function handleLostPasswordMock(
	pathname: string,
	options: ParityRequestOptions = {},
): Promise<ParityResponseSnapshot | null> {
	const method = (options.method ?? 'GET').toUpperCase();

	if (pathname === '/lostpassword/email' || pathname === '/index.php/lostpassword/email') {
		if (method !== 'POST') {
			return null;
		}

		const request = buildRequest(pathname, options);
		const body = typeof options.body === 'string' ? options.body : '';

		return responseToSnapshot(handleLostPasswordEmail(request, body));
	}

	const resetFormMatch = /^\/(?:index\.php\/)?lostpassword\/reset\/form\/([^/]+)\/([^/]+)$/.exec(pathname);

	if (resetFormMatch && method === 'GET') {
		const request = buildRequest(pathname, options);

		return responseToSnapshot(
			handleLostPasswordResetForm(
				request,
				decodeURIComponent(resetFormMatch[1]),
				decodeURIComponent(resetFormMatch[2]),
			),
		);
	}

	const setPasswordMatch = /^\/(?:index\.php\/)?lostpassword\/set\/([^/]+)\/([^/]+)$/.exec(pathname);

	if (setPasswordMatch && method === 'POST') {
		const request = buildRequest(pathname, options);
		const body = typeof options.body === 'string' ? options.body : '';

		return responseToSnapshot(
			handleLostPasswordSetPassword(
				request,
				decodeURIComponent(setPasswordMatch[1]),
				decodeURIComponent(setPasswordMatch[2]),
				body,
			),
		);
	}

	return null;
}

export function isLostPasswordPath(pathname: string, method = 'GET'): boolean {
	const normalizedMethod = method.toUpperCase();

	if (normalizedMethod === 'POST' && (
		pathname === '/lostpassword/email'
		|| pathname === '/index.php/lostpassword/email'
		|| /^\/(?:index\.php\/)?lostpassword\/set\/[^/]+\/[^/]+$/.test(pathname)
	)) {
		return true;
	}

	return normalizedMethod === 'GET' && /^\/(?:index\.php\/)?lostpassword\/reset\/form\/[^/]+\/[^/]+$/.test(pathname);
}
