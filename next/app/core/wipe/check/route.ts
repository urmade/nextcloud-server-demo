import { handleCheckWipe } from '@/src/server/wipe/api';

export async function POST(request: Request) {
	return handleCheckWipe(request);
}
