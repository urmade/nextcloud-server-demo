import { handleContactsMenuContacts } from '@/src/server/contactsmenu/api';

export async function POST(request: Request) {
	return handleContactsMenuContacts(request);
}
