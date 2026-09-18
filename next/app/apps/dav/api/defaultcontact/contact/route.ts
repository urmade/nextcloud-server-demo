import { handleGetDefaultContact, handleSetDefaultContact } from '@/src/server/dav/example-content';

export async function GET(request: Request) {
	return handleGetDefaultContact(request);
}

export async function PUT(request: Request) {
	return handleSetDefaultContact(request);
}
