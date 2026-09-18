import { handleGetAppPasswordWithOneTimePassword } from '@/src/server/ocs/app-password';

export async function GET(request: Request) {
	return handleGetAppPasswordWithOneTimePassword(request);
}
