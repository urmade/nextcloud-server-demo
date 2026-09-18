import { handleConfirmUserPassword } from '@/src/server/ocs/app-password';

export async function PUT(request: Request) {
	return await handleConfirmUserPassword(request);
}
