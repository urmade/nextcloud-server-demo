import { handleShareInfo } from '@/src/server/files_sharing/share-info';

export async function POST(request: Request) {
	return handleShareInfo(request);
}
