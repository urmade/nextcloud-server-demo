import { handleGetInheritedShares } from '@/src/server/files_sharing/share-api';

export function GET(request: Request) {
	return handleGetInheritedShares(request);
}
