import { resetSharingV1Config } from '@/src/server/sharing/config';
import { resetSharingV1Store } from '@/src/server/sharing/store';

export async function POST() {
	if (process.env.NC_PARITY_EXAPP !== 'true') {
		return new Response(null, { status: 404 });
	}

	resetSharingV1Store();
	resetSharingV1Config();

	return new Response(null, { status: 204 });
}
