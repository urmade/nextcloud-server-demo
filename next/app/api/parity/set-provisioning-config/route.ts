import {
	setParityDefaultPhoneRegion,
	setParityPreferenceFixtureListenerEnabled,
} from '@/src/server/provisioning/config';

export async function POST(request: Request) {
	if (process.env.NC_PARITY_EXAPP !== 'true') {
		return new Response(null, { status: 404 });
	}

	const body = await request.json() as {
		defaultPhoneRegion?: string | null;
		preferenceFixtureListener?: boolean;
	};

	if ('defaultPhoneRegion' in body) {
		setParityDefaultPhoneRegion(body.defaultPhoneRegion ?? null);
	}

	if (typeof body.preferenceFixtureListener === 'boolean') {
		setParityPreferenceFixtureListenerEnabled(body.preferenceFixtureListener);
	}

	return new Response(null, { status: 204 });
}
