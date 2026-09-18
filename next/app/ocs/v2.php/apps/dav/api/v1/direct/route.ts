import { handleDirectGetUrl } from '@/src/server/dav/direct';

export async function POST(request: Request) {
	return handleDirectGetUrl(request);
}
