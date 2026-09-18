import { handleGetStorageStats } from '@/src/server/files/api';

export async function GET(request: Request) {
	return handleGetStorageStats(request);
}
