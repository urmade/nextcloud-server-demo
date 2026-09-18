import { resetPrincipalsStore } from '@/src/server/dav/principals-store';

export async function POST(): Promise<Response> {
	if (process.env.NC_PARITY_EXAPP !== 'true') {
		return new Response(null, { status: 404 });
	}

	resetPrincipalsStore();

	return new Response(null, { status: 204 });
}
