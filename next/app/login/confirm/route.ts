import { handleConfirmPassword } from '@/src/server/auth/confirm-password';

export async function POST(request: Request) {
	const body = await request.text();

	return handleConfirmPassword(request, body);
}
