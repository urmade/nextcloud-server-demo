import { handleSetEnableDefaultContactRequest } from '@/src/server/dav/example-content';

export async function PUT(request: Request) {
	return handleSetEnableDefaultContactRequest(request);
}
