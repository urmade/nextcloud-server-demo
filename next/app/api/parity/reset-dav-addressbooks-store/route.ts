import { resetAddressBooksStore } from '@/src/server/dav/addressbooks-store';

export async function POST(): Promise<Response> {
	if (process.env.NC_PARITY_EXAPP !== 'true') {
		return new Response(null, { status: 404 });
	}

	resetAddressBooksStore();

	return new Response(null, { status: 204 });
}
