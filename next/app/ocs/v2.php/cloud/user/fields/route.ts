import { handleGetEditableFields } from '@/src/server/provisioning/self-read';

export async function GET(request: Request) {
	return handleGetEditableFields(request);
}
