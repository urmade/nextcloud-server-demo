import { handleOcsGetConfig } from '@/src/server/ocs/public-leftovers';

export async function GET(request: Request) {
	return await handleOcsGetConfig(request);
}
