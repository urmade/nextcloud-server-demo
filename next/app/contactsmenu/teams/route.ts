import { handleContactsMenuTeams } from '@/src/server/contactsmenu/api';

export async function GET(request: Request) {
	return handleContactsMenuTeams(request);
}
