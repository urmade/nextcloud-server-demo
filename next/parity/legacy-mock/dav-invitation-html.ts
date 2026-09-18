import {
	handleInvitationAccept,
	handleInvitationDecline,
	handleInvitationOptions,
	handleInvitationProcessMoreOptions,
} from '@/src/server/dav/invitation-html';
import { snapshotResponse } from '../compare';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';

const ACCEPT_PATH = /^\/(?:index\.php\/)?apps\/dav\/invitation\/accept\/([^/]+)\/?$/;
const DECLINE_PATH = /^\/(?:index\.php\/)?apps\/dav\/invitation\/decline\/([^/]+)\/?$/;
const OPTIONS_PATH = /^\/(?:index\.php\/)?apps\/dav\/invitation\/moreOptions\/([^/]+)\/?$/;

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

export function isDavInvitationHtmlMockPath(pathname: string, method = 'GET'): boolean {
	const normalizedMethod = method.toUpperCase();

	if (normalizedMethod !== 'GET' && normalizedMethod !== 'POST') {
		return false;
	}

	return ACCEPT_PATH.test(pathname)
		|| DECLINE_PATH.test(pathname)
		|| OPTIONS_PATH.test(pathname);
}

export async function handleDavInvitationHtmlMock(
	pathname: string,
	search: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	const method = (options.method ?? 'GET').toUpperCase();
	const request = buildRequest(pathname, search, options);

	const acceptMatch = ACCEPT_PATH.exec(pathname);

	if (acceptMatch && method === 'GET') {
		return responseToSnapshot(handleInvitationAccept(decodeURIComponent(acceptMatch[1])));
	}

	const declineMatch = DECLINE_PATH.exec(pathname);

	if (declineMatch && method === 'GET') {
		return responseToSnapshot(handleInvitationDecline(decodeURIComponent(declineMatch[1])));
	}

	const optionsMatch = OPTIONS_PATH.exec(pathname);

	if (!optionsMatch) {
		return null;
	}

	const token = decodeURIComponent(optionsMatch[1]);

	if (method === 'GET') {
		return responseToSnapshot(handleInvitationOptions(token));
	}

	if (method === 'POST') {
		return responseToSnapshot(await handleInvitationProcessMoreOptions(request, token));
	}

	return null;
}
