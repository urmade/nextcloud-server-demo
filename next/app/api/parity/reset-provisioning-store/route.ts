import { resetProvisioningStore } from '@/src/server/provisioning/store';

export async function POST() {
	if (process.env.NC_PARITY_EXAPP !== 'true') {
		return new Response(null, { status: 404 });
	}

	resetProvisioningStore();

	return new Response(null, { status: 204 });
}
