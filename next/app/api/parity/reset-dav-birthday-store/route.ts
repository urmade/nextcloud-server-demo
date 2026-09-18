import { resetBirthdayCalendarStore } from '@/src/server/dav/birthday-calendar-store';

export async function POST() {
	if (process.env.NC_PARITY_EXAPP !== 'true') {
		return new Response(null, { status: 404 });
	}

	resetBirthdayCalendarStore();

	return new Response(null, { status: 204 });
}
