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
import { getParityEnv } from '../env';

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

async function seedCalendarsOnServer(payload: SeedPayload): Promise<void> {
	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/api/parity/seed-dav-calendars`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
		},
		body: JSON.stringify(payload),
	});

	if (!response.ok) {
		throw new Error(`Failed to seed DAV calendars store: ${response.status}`);
	}
}

function seedCalendarsLocally(payload: SeedPayload): void {
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
}

async function seedCalendarsOnBothSides(payload: SeedPayload): Promise<void> {
	seedCalendarsLocally(payload);
	await seedCalendarsOnServer(payload);
}

export async function resetParityCalendarsStores(): Promise<void> {
	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/api/parity/reset-dav-calendars-store`, {
		method: 'POST',
	});

	if (!response.ok) {
		throw new Error(`Failed to reset DAV calendars store: ${response.status}`);
	}

	const { resetCalendarsStore } = await import('@/src/server/dav/calendars-store');
	const { resetPrincipalsStore } = await import('@/src/server/dav/principals-store');
	resetCalendarsStore();
	resetPrincipalsStore();
}

export async function seedParityUserCalendar(userId: string, calendarUri: string, displayName?: string) {
	await seedCalendarsOnBothSides({
		userCalendars: [{ userId, calendarUri, displayName }],
	});
}

export async function seedParityPublicCalendar(
	token: string,
	ownerUserId: string,
	calendarUri: string,
	options: { ownerEnabled?: boolean; displayName?: string } = {},
) {
	await seedCalendarsOnBothSides({
		publicCalendars: [{
			token,
			ownerUserId,
			calendarUri,
			displayName: options.displayName,
			ownerEnabled: options.ownerEnabled,
		}],
	});
}

export async function seedParityRemoteCalendar(remoteId: string, cloudId: string, calendarUri: string) {
	await seedCalendarsOnBothSides({
		remoteCalendars: [{ remoteId, cloudId, calendarUri }],
	});
}

export async function seedParitySystemResourceCalendar(resourceId: string, calendarUri: string) {
	await seedCalendarsOnBothSides({
		systemResourceCalendars: [{ resourceId, calendarUri }],
	});
}

export async function seedParitySystemRoomCalendar(roomId: string, calendarUri: string) {
	await seedCalendarsOnBothSides({
		systemRoomCalendars: [{ roomId, calendarUri }],
	});
}
