import { handleShareesSearch } from '@/src/server/files_sharing/sharees-api';

export function GET(request: Request) {
	return handleShareesSearch(request);
}
