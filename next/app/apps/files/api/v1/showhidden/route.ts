import { handleShowHiddenFiles } from '@/src/server/files/api';

export async function POST(request: Request) {
	return handleShowHiddenFiles(request);
}
