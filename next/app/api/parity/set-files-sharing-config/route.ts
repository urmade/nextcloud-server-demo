import { setIncomingServer2ServerShareEnabled } from '@/src/server/files_sharing/config';

export async function POST(request: Request) {
	if (process.env.NC_PARITY_EXAPP !== 'true') {
		return new Response(null, { status: 404 });
	}

	const body = await request.json() as { incomingServer2ServerShareEnabled?: boolean };

	if (typeof body.incomingServer2ServerShareEnabled === 'boolean') {
		setIncomingServer2ServerShareEnabled(body.incomingServer2ServerShareEnabled);
	}

	return new Response(null, { status: 204 });
}
