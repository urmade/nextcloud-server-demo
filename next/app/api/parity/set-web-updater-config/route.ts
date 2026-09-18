import {
	resetParityWebUpdaterRuntimeConfig,
	setParityWebUpdaterRuntimeConfig,
} from '@/src/server/ocs/web-updater-config';

export async function POST(request: Request) {
	if (process.env.NC_PARITY_EXAPP !== 'true') {
		return new Response(null, { status: 404 });
	}

	const body = await request.json() as {
		reset?: boolean;
		needsUpgrade?: boolean;
		disableWeb?: boolean;
	};

	if (body.reset === true) {
		resetParityWebUpdaterRuntimeConfig();
	} else {
		setParityWebUpdaterRuntimeConfig(body);
	}

	return new Response(null, { status: 204 });
}
