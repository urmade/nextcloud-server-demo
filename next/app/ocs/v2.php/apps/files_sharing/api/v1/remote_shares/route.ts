import { handleGetRemoteShares } from '@/src/server/files_sharing/remote-share-api';

export function GET(request: Request) {
	return handleGetRemoteShares(request);
}
