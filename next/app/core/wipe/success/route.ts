import { handleWipeDone } from '@/src/server/wipe/api';

export async function POST(request: Request) {
	return handleWipeDone(request);
}
