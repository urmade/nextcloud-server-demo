import { handleContactsMenuFindOne } from '@/src/server/contactsmenu/api';

export async function POST(request: Request) {
	return handleContactsMenuFindOne(request);
}
