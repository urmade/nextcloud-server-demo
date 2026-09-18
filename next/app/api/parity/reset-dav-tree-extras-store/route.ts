import { resetTreeExtrasStore } from '@/src/server/dav/tree-extras-store';

export async function POST(): Promise<Response> {
	if (process.env.NC_PARITY_EXAPP !== 'true') {
		return new Response(null, { status: 404 });
	}

	resetTreeExtrasStore();

	return new Response(null, { status: 204 });
}
