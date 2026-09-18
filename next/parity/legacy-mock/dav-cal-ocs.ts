import { SESSION_COOKIE, USERNAME_COOKIE } from '@/src/server/auth/cookies';
import { getOrCreateSession, updateSession } from '@/src/server/auth/session-store';
import {
	handleAcceptFederatedCalendar,
	handleDeclineFederatedCalendar,
	handleGetPendingFederatedCalendars,
	handleGetUpcomingEvents,
} from '@/src/server/dav/cal-ocs';
import { snapshotResponse } from '../compare';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';
import { parseCookiesFromOptions } from './auth';

const UPCOMING_EVENTS_PATH = '/ocs/v2.php/apps/dav/api/v1/events/upcoming';
const PENDING_FEDERATED_PATH = '/ocs/v2.php/apps/dav/api/v1/federated_calendars/pending';
const PENDING_FEDERATED_PREFIX = `${PENDING_FEDERATED_PATH}/`;

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

function ensureSessionFromLoginCookies(options: ParityRequestOptions): void {
	const cookies = parseCookiesFromOptions(options);
	const sessionId = cookies[SESSION_COOKIE];
	const userId = cookies[USERNAME_COOKIE];

	if (!sessionId || !userId) {
		return;
	}

	const session = getOrCreateSession(sessionId);
	session.userId = userId;
	session.loginName = userId;
	updateSession(session);
}

function parsePendingFederatedId(pathname: string): number | null {
	if (!pathname.startsWith(PENDING_FEDERATED_PREFIX)) {
		return null;
	}

	const remainder = pathname.slice(PENDING_FEDERATED_PREFIX.length);

	if (!remainder || remainder.includes('/')) {
		return null;
	}

	const id = Number.parseInt(remainder, 10);

	return Number.isNaN(id) ? null : id;
}

export async function handleDavCalOcsMock(
	pathname: string,
	search: string,
	options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	const method = (options.method ?? 'GET').toUpperCase();
	ensureSessionFromLoginCookies(options);

	if (pathname === UPCOMING_EVENTS_PATH && method === 'GET') {
		return responseToSnapshot(handleGetUpcomingEvents(buildRequest(pathname, search, options)));
	}

	if (pathname === PENDING_FEDERATED_PATH && method === 'GET') {
		return responseToSnapshot(handleGetPendingFederatedCalendars(buildRequest(pathname, search, options)));
	}

	const pendingId = parsePendingFederatedId(pathname);

	if (pendingId !== null && method === 'POST') {
		return responseToSnapshot(handleAcceptFederatedCalendar(buildRequest(pathname, search, options), pendingId));
	}

	if (pendingId !== null && method === 'DELETE') {
		return responseToSnapshot(handleDeclineFederatedCalendar(buildRequest(pathname, search, options), pendingId));
	}

	return null;
}

export function isDavCalOcsMockPath(pathname: string): boolean {
	if (pathname === UPCOMING_EVENTS_PATH || pathname === PENDING_FEDERATED_PATH) {
		return true;
	}

	return parsePendingFederatedId(pathname) !== null;
}
