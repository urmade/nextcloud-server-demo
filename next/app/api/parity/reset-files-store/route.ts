import { resetFilesApiStores } from '@/src/server/files/api';

export async function POST() {
	if (process.env.NC_PARITY_EXAPP !== 'true') {
		return new Response(null, { status: 404 });
	}

	resetFilesApiStores();

	return new Response(null, { status: 204 });
}
