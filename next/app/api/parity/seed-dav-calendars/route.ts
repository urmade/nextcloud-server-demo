import {
	seedPublicCalendar,
	seedRemoteCalendar,
	seedSystemResourceCalendar,
	seedSystemRoomCalendar,
	seedUserCalendar,
} from '@/src/server/dav/calendars-store';
import {
	seedCalendarResourcePrincipal,
	seedCalendarRoomPrincipal,
	seedRemoteUserPrincipal,
} from '@/src/server/dav/principals-store';

interface SeedPayload {
	userCalendars?: Array<{ userId: string; calendarUri: string; displayName?: string }>;
	publicCalendars?: Array<{
		token: string;
		ownerUserId: string;
		calendarUri: string;
		displayName?: string;
		ownerEnabled?: boolean;
	}>;
	remoteCalendars?: Array<{ remoteId: string; cloudId: string; calendarUri: string }>;
	systemResourceCalendars?: Array<{ resourceId: string; calendarUri: string }>;
	systemRoomCalendars?: Array<{ roomId: string; calendarUri: string }>;
}

export async function POST(request: Request): Promise<Response> {
	if (process.env.NC_PARITY_EXAPP !== 'true') {
		return new Response(null, { status: 404 });
	}

	const payload = await request.json() as SeedPayload;

	for (const entry of payload.userCalendars ?? []) {
		seedUserCalendar(entry.userId, entry.calendarUri, entry.displayName);
	}

	for (const entry of payload.publicCalendars ?? []) {
		seedPublicCalendar(entry.token, entry.ownerUserId, entry.calendarUri, {
			displayName: entry.displayName,
			ownerEnabled: entry.ownerEnabled,
		});
	}

	for (const entry of payload.remoteCalendars ?? []) {
		seedRemoteUserPrincipal(entry.remoteId, entry.cloudId, entry.cloudId);
		seedRemoteCalendar(entry.remoteId, entry.cloudId, entry.calendarUri);
	}

	for (const entry of payload.systemResourceCalendars ?? []) {
		seedCalendarResourcePrincipal(entry.resourceId, entry.resourceId);
		seedSystemResourceCalendar(entry.resourceId, entry.calendarUri);
	}

	for (const entry of payload.systemRoomCalendars ?? []) {
		seedCalendarRoomPrincipal(entry.roomId, entry.roomId);
		seedSystemRoomCalendar(entry.roomId, entry.calendarUri);
	}

	return new Response(null, { status: 204 });
}
