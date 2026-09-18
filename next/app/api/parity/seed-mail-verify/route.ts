import {
	createMailVerificationToken,
	encryptMailVerificationKey,
} from '@/src/server/provisioning/mail-verify';

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

	const token = createMailVerificationToken(body.userId, body.email);

	return Response.json({
		token,
		key: encryptMailVerificationKey(body.email),
	});
}
