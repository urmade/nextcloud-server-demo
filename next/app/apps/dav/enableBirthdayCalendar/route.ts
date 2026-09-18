import { handleEnableBirthdayCalendar } from '@/src/server/dav/birthday-calendar';

export async function POST(request: Request) {
	return handleEnableBirthdayCalendar(request);
}
