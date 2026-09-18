import { getSession, updateSession } from '@/src/server/auth/session-store';

export async function POST(request: Request) {
	if (process.env.NC_PARITY_EXAPP !== 'true') {
		return new Response(null, { status: 404 });
	}

	const body = await request.json() as { sessionId?: string };
	const session = body.sessionId ? getSession(body.sessionId) : null;

	if (!session) {
		return new Response(null, { status: 404 });
	}

	session.lastPasswordConfirm = 0;
	updateSession(session);

	return new Response(null, { status: 204 });
}
