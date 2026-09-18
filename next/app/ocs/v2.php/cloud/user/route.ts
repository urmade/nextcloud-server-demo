import { handleGetCurrentUser } from '@/src/server/provisioning/self-read';

export async function GET(request: Request) {
	return handleGetCurrentUser(request);
}
