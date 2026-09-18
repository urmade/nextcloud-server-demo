import { handleGetViewConfigs } from '@/src/server/files/api';

export async function GET(request: Request) {
	return handleGetViewConfigs(request);
}
