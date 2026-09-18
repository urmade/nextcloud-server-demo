import { resetOutOfOfficeStore } from '@/src/server/dav/out-of-office-store';

export async function POST() {
	if (process.env.NC_PARITY_EXAPP !== 'true') {
		return new Response(null, { status: 404 });
	}

	resetOutOfOfficeStore();

	return new Response(null, { status: 204 });
}
