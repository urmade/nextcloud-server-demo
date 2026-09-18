import { resetAvatarStore } from '@/src/server/avatar/store';

export async function POST() {
	if (process.env.NC_PARITY_EXAPP !== 'true') {
		return new Response(null, { status: 404 });
	}

	resetAvatarStore();

	return new Response(null, { status: 204 });
}
