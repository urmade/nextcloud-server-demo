import { handleDirectEditingOpen } from '@/src/server/files/direct-editing';

export async function POST(request: Request) {
	return handleDirectEditingOpen(request);
}
