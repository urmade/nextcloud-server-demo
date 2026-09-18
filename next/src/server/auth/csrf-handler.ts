import { buildSessionCookieHeader, parseCookieHeader, passesStrictCookieCheck } from '@/src/server/auth/cookies';
import { appendSetCookieHeaders, ensureCsrfToken, resolveSession } from '@/src/server/auth/session';

export function handleCsrfTokenGet(request: Request): Response {
	const resolved = resolveSession(request);
	const cookies = parseCookieHeader(request.headers.get('cookie'));
	const ocsApiRequest = Boolean(request.headers.get('ocs-apirequest'));
	const headers = new Headers({
		'content-type': 'application/json; charset=utf-8',
		'cache-control': 'no-cache, no-store, must-revalidate',
	});

	appendSetCookieHeaders(headers, resolved.sameSiteCookieHeaders);

	if (resolved.isNew) {
		appendSetCookieHeaders(headers, [buildSessionCookieHeader(resolved.session.id)]);
	}

	if (!passesStrictCookieCheck(cookies, ocsApiRequest)) {
		return new Response('[]', {
			status: 403,
			headers,
		});
	}

	const token = ensureCsrfToken(resolved.session);

	return new Response(JSON.stringify({ token }), {
		status: 200,
		headers,
	});
}
