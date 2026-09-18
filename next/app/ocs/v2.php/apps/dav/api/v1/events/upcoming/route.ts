import { handleGetUpcomingEvents } from '@/src/server/dav/cal-ocs';

export async function GET(request: Request) {
	return handleGetUpcomingEvents(request);
}
