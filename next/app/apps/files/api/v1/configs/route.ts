import { handleGetConfigs } from '@/src/server/files/api';

export async function GET(request: Request) {
	return handleGetConfigs(request);
}
