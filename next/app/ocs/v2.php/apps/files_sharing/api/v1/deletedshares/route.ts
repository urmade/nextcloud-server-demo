import { handleGetDeletedShares } from '@/src/server/files_sharing/deleted-share-api';

export function GET(request: Request) {
	return handleGetDeletedShares(request);
}
