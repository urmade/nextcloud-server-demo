import { resetCalOcsStore } from '@/src/server/dav/cal-ocs-store';

export async function POST() {
	if (process.env.NC_PARITY_EXAPP !== 'true') {
		return new Response(null, { status: 404 });
	}

	resetCalOcsStore();

	return new Response(null, { status: 204 });
}
