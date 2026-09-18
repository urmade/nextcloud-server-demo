import { handleOcsPersonCheck } from '@/src/server/ocs/public-leftovers';

export async function POST(request: Request) {
	return await handleOcsPersonCheck(request);
}
