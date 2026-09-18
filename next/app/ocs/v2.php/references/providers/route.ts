import { handleGetProvidersInfo } from '@/src/server/reference/api';

export async function GET(request: Request) {
	return await handleGetProvidersInfo(request);
}
