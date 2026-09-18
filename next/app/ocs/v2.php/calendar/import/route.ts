import { handleCalendarImport } from '@/src/server/dav/cal-contacts-io';

export async function POST(request: Request) {
	return handleCalendarImport(request);
}
