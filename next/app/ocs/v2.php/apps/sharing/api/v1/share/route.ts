import { handleCreateShare } from '@/src/server/sharing/api-v1';

export function POST(request: Request) {
	return handleCreateShare(request);
}
