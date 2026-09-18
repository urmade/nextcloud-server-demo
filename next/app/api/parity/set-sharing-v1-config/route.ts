import {
	setShareApiEnabled,
	setUnifiedApiEnabled,
} from '@/src/server/sharing/config';

export async function POST(request: Request) {
	if (process.env.NC_PARITY_EXAPP !== 'true') {
		return new Response(null, { status: 404 });
	}

	const body = await request.json() as {
		unifiedApiEnabled?: boolean;
		shareApiEnabled?: boolean;
	};

	if (typeof body.unifiedApiEnabled === 'boolean') {
		setUnifiedApiEnabled(body.unifiedApiEnabled);
	}

	if (typeof body.shareApiEnabled === 'boolean') {
		setShareApiEnabled(body.shareApiEnabled);
	}

	return new Response(null, { status: 204 });
}
