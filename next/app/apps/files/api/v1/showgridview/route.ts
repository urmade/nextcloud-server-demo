import { handleGetGridView } from '@/src/server/files/api';

export async function GET(request: Request) {
	return handleGetGridView(request);
}
