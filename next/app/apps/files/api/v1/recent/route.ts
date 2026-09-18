import { handleGetRecentFiles } from '@/src/server/files/api';

export async function GET(request: Request) {
	return handleGetRecentFiles(request);
}
