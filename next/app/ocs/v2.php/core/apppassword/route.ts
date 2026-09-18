import { handleDeleteAppPassword } from '@/src/server/ocs/app-password';

export async function DELETE(request: Request) {
	return handleDeleteAppPassword(request);
}
