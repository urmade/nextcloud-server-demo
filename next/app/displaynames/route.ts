import { handleDisplayNames } from '@/src/server/contactsmenu/api';

export async function POST(request: Request) {
	return handleDisplayNames(request);
}
