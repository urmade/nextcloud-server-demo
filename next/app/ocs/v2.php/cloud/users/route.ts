import { handleGetUsers } from '@/src/server/provisioning/users-list';
import { handleAddUser } from '@/src/server/provisioning/users-lifecycle';

export async function GET(request: Request) {
	return handleGetUsers(request);
}

export async function POST(request: Request) {
	return handleAddUser(request);
}
