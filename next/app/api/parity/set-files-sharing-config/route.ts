import {
	setIncomingServer2ServerShareEnabled,
	setOutgoingServer2ServerShareEnabled,
} from '@/src/server/files_sharing/config';

export async function POST(request: Request) {
	if (process.env.NC_PARITY_EXAPP !== 'true') {
		return new Response(null, { status: 404 });
	}

	const body = await request.json() as {
		incomingServer2ServerShareEnabled?: boolean;
		outgoingServer2ServerShareEnabled?: boolean;
	};

	if (typeof body.incomingServer2ServerShareEnabled === 'boolean') {
		setIncomingServer2ServerShareEnabled(body.incomingServer2ServerShareEnabled);
	}

	if (typeof body.outgoingServer2ServerShareEnabled === 'boolean') {
		setOutgoingServer2ServerShareEnabled(body.outgoingServer2ServerShareEnabled);
	}

	return new Response(null, { status: 204 });
}
