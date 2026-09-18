import { buildSessionCookieHeader } from '@/src/server/auth/cookies';
import { appendSetCookieHeaders, resolveSession } from '@/src/server/auth/session';

export function handleHeartbeatGet(request: Request): Response {
	const resolved = resolveSession(request);
	const headers = new Headers();

	appendSetCookieHeaders(headers, resolved.sameSiteCookieHeaders);

	if (resolved.isNew) {
		appendSetCookieHeaders(headers, [buildSessionCookieHeader(resolved.session.id)]);
	}

	return new Response(null, { status: 200, headers });
}
