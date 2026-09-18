import { handleGetRecentUsers } from '@/src/server/provisioning/users-list';

export async function GET(request: Request) {
	return handleGetRecentUsers(request);
}
