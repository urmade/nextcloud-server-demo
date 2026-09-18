import { handleContactsImport } from '@/src/server/dav/cal-contacts-io';

export async function POST(request: Request) {
	return handleContactsImport(request);
}
