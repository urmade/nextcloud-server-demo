import { buildClearCookieHeaders } from '@/src/server/auth/cookies';
import { appendSetCookieHeaders, type ResolvedSession } from '@/src/server/auth/session';
import { deleteSession } from '@/src/server/auth/session-store';

export function handleLogoutGet(request: Request, resolved: ResolvedSession): Response {
	const { session, sameSiteCookieHeaders } = resolved;
	const userId = session.userId;
	const headers = new Headers({
		location: new URL('/login?clear=true', request.url).toString(),
	});

	appendSetCookieHeaders(headers, [...sameSiteCookieHeaders, ...buildClearCookieHeaders()]);

	if (userId) {
		headers.set('x-user-id', userId);
	}

	deleteSession(session.id);

	return new Response(null, {
		status: 303,
		headers,
	});
}

export function handleLogoutForSession(sessionId: string): void {
	deleteSession(sessionId);
}
