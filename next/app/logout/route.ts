import { handleLogoutGet } from '@/src/server/auth/logout';
import { resolveSession } from '@/src/server/auth/session';

export async function GET(request: Request) {
	return handleLogoutGet(request, resolveSession(request));
}
