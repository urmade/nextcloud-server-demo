import { resetTaskStore } from '@/src/server/task-processing/store';

export async function POST() {
	if (process.env.NC_PARITY_EXAPP !== 'true') {
		return new Response(null, { status: 404 });
	}

	resetTaskStore();

	return new Response(null, { status: 204 });
}
