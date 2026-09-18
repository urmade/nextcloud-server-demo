import { setMandatoryTwoFactorEnforced } from '@/src/server/two-factor/enforcement';

export async function POST(request: Request) {
	if (process.env.NC_PARITY_EXAPP !== 'true') {
		return new Response(null, { status: 404 });
	}

	const body = await request.json() as { twoFactorEnforced?: boolean };

	if (typeof body.twoFactorEnforced === 'boolean') {
		setMandatoryTwoFactorEnforced(body.twoFactorEnforced);
	}

	return new Response(null, { status: 204 });
}
