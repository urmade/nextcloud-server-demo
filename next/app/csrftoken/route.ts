import { handleCsrfTokenGet } from '@/src/server/auth/csrf-handler';

export async function GET(request: Request) {
	return handleCsrfTokenGet(request);
}
