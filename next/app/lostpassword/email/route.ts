import { handleLostPasswordEmail } from '@/src/server/auth/lost-password';

export async function POST(request: Request) {
	const body = await request.text();

	return handleLostPasswordEmail(request, body);
}
