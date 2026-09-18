import { handleCreateShare, handleGetShares } from '@/src/server/files_sharing/share-api';

export function GET(request: Request) {
	return handleGetShares(request);
}

export async function POST(request: Request) {
	return handleCreateShare(request);
}
