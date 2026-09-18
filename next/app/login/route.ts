import { handleLoginGet, handleLoginPost } from '@/src/server/auth/login';
import { resolveSession } from '@/src/server/auth/session';

export async function GET(request: Request) {
	return handleLoginGet(request, resolveSession(request));
}

export async function POST(request: Request) {
	const body = await request.text();

	return handleLoginPost(request, resolveSession(request), body);
}
