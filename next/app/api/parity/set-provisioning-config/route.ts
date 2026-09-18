import { setParityDefaultPhoneRegion } from '@/src/server/provisioning/config';

export async function POST(request: Request) {
	if (process.env.NC_PARITY_EXAPP !== 'true') {
		return new Response(null, { status: 404 });
	}

	const body = await request.json() as { defaultPhoneRegion?: string | null };
	const region = body.defaultPhoneRegion ?? null;

	setParityDefaultPhoneRegion(region);

	return new Response(null, { status: 204 });
}
