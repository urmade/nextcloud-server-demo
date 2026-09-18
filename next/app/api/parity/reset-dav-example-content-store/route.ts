import { resetExampleContentStore } from '@/src/server/dav/example-content-store';

export async function POST() {
	if (process.env.NC_PARITY_EXAPP !== 'true') {
		return new Response(null, { status: 404 });
	}

	resetExampleContentStore();

	return new Response(null, { status: 204 });
}
