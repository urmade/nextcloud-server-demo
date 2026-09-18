import { parseCookieHeader, SESSION_COOKIE } from '@/src/server/auth/cookies';
import { getSession } from '@/src/server/auth/session-store';

export const PARITY_EXAPP_BEARER = 'parity-ex-app';

function isParityExAppBearer(request: Request): boolean {
	if (process.env.NC_PARITY_EXAPP !== 'true') {
		return false;
	}

	const authorization = request.headers.get('authorization')?.trim();

	return authorization === `Bearer ${PARITY_EXAPP_BEARER}`;
}

export function isExAppSession(request: Request): boolean {
	if (isParityExAppBearer(request)) {
		return true;
	}

	const cookies = parseCookieHeader(request.headers.get('cookie'));
	const session = getSession(cookies[SESSION_COOKIE]);

	return session?.appApi === true;
}

export function requireExAppSession(request: Request): true | Response {
	if (isExAppSession(request)) {
		return true;
	}

	return Response.json({ message: 'ExApp required' }, {
		status: 412,
		headers: {
			'content-type': 'application/json; charset=utf-8',
		},
	});
}
