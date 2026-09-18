import {
	setParityDefaultPhoneRegion,
	setParityGenerateUserId,
	setParityPreferenceFixtureListenerEnabled,
	setParityRequireEmail,
	setParityWelcomeMailSendFails,
} from '@/src/server/provisioning/config';

export async function POST(request: Request) {
	if (process.env.NC_PARITY_EXAPP !== 'true') {
		return new Response(null, { status: 404 });
	}

	const body = await request.json() as {
		defaultPhoneRegion?: string | null;
		preferenceFixtureListener?: boolean;
		generateUserId?: boolean;
		requireEmail?: boolean;
		welcomeMailSendFails?: boolean;
	};

	if ('defaultPhoneRegion' in body) {
		setParityDefaultPhoneRegion(body.defaultPhoneRegion ?? null);
	}

	if (typeof body.preferenceFixtureListener === 'boolean') {
		setParityPreferenceFixtureListenerEnabled(body.preferenceFixtureListener);
	}

	if (typeof body.generateUserId === 'boolean') {
		setParityGenerateUserId(body.generateUserId);
	}

	if (typeof body.requireEmail === 'boolean') {
		setParityRequireEmail(body.requireEmail);
	}

	if (typeof body.welcomeMailSendFails === 'boolean') {
		setParityWelcomeMailSendFails(body.welcomeMailSendFails);
	}

	return new Response(null, { status: 204 });
}
