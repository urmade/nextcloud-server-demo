import { parseCookieHeader, SESSION_COOKIE } from '@/src/server/auth/cookies';
import { getSession } from '@/src/server/auth/session-store';
import { requireAuthenticatedUser } from '@/src/server/ocs/auth';
import { ocsForbiddenResponse, parseOcsVersion } from '@/src/server/ocs/respond';

const ADMIN_REQUIRED_MESSAGE = 'Logged in account must be an admin';

export function getConfiguredAdminUserId(): string {
	return process.env.NC_ADMIN_USER?.trim() || 'admin';
}

export function isAdminUserId(userId: string): boolean {
	return userId === getConfiguredAdminUserId();
}

export function requireAdminUser(request: Request): string | Response {
	const userId = requireAuthenticatedUser(request);

	if (userId instanceof Response) {
		return userId;
	}

	if (!isAdminUserId(userId)) {
		return ocsForbiddenResponse(parseOcsVersion(request), ADMIN_REQUIRED_MESSAGE, {});
	}

	return userId;
}

export function getSessionFromRequest(request: Request) {
	const cookies = parseCookieHeader(request.headers.get('cookie'));

	return getSession(cookies[SESSION_COOKIE]) ?? null;
}
