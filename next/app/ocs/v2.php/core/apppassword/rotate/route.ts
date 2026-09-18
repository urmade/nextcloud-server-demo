import { handleRotateAppPassword } from '@/src/server/ocs/app-password';

export async function POST(request: Request) {
	return handleRotateAppPassword(request);
}
