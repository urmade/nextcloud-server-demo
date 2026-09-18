import { removeEmailFromUser } from '@/src/server/provisioning/mail-verify';

export async function POST(request: Request) {
	if (process.env.NC_PARITY_EXAPP !== 'true') {
		return new Response(null, { status: 404 });
	}

	const body = await request.json() as { userId?: string; email?: string };

	if (!body.userId || !body.email) {
		return new Response(JSON.stringify({ message: 'userId and email are required' }), {
			status: 400,
			headers: { 'content-type': 'application/json' },
		});
	}

	removeEmailFromUser(body.userId, body.email);

	return new Response(null, { status: 204 });
}
