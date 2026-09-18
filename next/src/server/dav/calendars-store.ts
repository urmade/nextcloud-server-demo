import { findParityUser } from '@/src/server/config/users';
import {
	findCalendarResourcePrincipal,
	findCalendarRoomPrincipal,
	findRemoteUserPrincipalByCloudId,
} from './principals-store';

export interface CalendarObjectRecord {
	uri: string;
	content: string;
	etag: string;
	size: number;
	contentType: string;
}

export interface CalendarRecord {
	id: number;
	uri: string;
	principalUri: string;
	displayName: string;
	components: string;
	objects: Map<string, CalendarObjectRecord>;
}

export interface PublicCalendarRecord {
	token: string;
	calendarId: number;
	ownerUserId: string;
	ownerEnabled: boolean;
}

interface CalendarsStoreState {
	calendarsByKey: Map<string, CalendarRecord>;
	publicCalendarsByToken: Map<string, PublicCalendarRecord>;
	nextCalendarId: number;
}

const globalState = globalThis as typeof globalThis & {
	__ncDavCalendarsStore?: CalendarsStoreState;
};

function storeState(): CalendarsStoreState {
	if (!globalState.__ncDavCalendarsStore) {
		globalState.__ncDavCalendarsStore = {
			calendarsByKey: new Map(),
			publicCalendarsByToken: new Map(),
			nextCalendarId: 1,
		};
	}

	return globalState.__ncDavCalendarsStore;
}

const RESERVED_CALENDAR_NAMES = new Set(['contact_birthdays', 'trashbin']);

function calendarKey(principalUri: string, uri: string): string {
	return `${principalUri}/${uri}`;
}

export function doesViolateReservedCalendarName(name: string): boolean {
	return RESERVED_CALENDAR_NAMES.has(name) || name.startsWith('app-generated');
}

export function principalUriForUser(userId: string): string {
	return `principals/users/${userId}`;
}

export function principalUriForRemoteUser(remoteId: string): string {
	return `principals/remote-users/${remoteId}`;
}

export function principalUriForResource(id: string): string {
	return `principals/calendar-resources/${id}`;
}

export function principalUriForRoom(id: string): string {
	return `principals/calendar-rooms/${id}`;
}

export function userExists(userId: string): boolean {
	return findParityUser(userId) !== null;
}

export function getCalendarsForPrincipal(principalUri: string): CalendarRecord[] {
	const { calendarsByKey } = storeState();

	return [...calendarsByKey.values()].filter((calendar) => calendar.principalUri === principalUri);
}

export function getCalendar(principalUri: string, uri: string): CalendarRecord | null {
	return storeState().calendarsByKey.get(calendarKey(principalUri, uri)) ?? null;
}

export function createCalendar(principalUri: string, uri: string, displayName?: string): CalendarRecord {
	const state = storeState();
	const record: CalendarRecord = {
		id: state.nextCalendarId++,
		uri,
		principalUri,
		displayName: displayName ?? uri,
		components: 'VEVENT,VTODO,VJOURNAL',
		objects: new Map(),
	};

	state.calendarsByKey.set(calendarKey(principalUri, uri), record);

	return record;
}

export function putCalendarObject(
	principalUri: string,
	calendarUri: string,
	objectUri: string,
	content: string,
	contentType = 'text/calendar; charset=utf-8',
): CalendarObjectRecord | 'not-found' {
	const calendar = getCalendar(principalUri, calendarUri);

	if (!calendar) {
		return 'not-found';
	}

	const etag = `"${Buffer.from(content).toString('base64').slice(0, 16)}"`;
	const record: CalendarObjectRecord = {
		uri: objectUri,
		content,
		etag,
		size: Buffer.byteLength(content, 'utf8'),
		contentType,
	};

	calendar.objects.set(objectUri, record);

	return record;
}

export function getCalendarObject(
	principalUri: string,
	calendarUri: string,
	objectUri: string,
): CalendarObjectRecord | null {
	return getCalendar(principalUri, calendarUri)?.objects.get(objectUri) ?? null;
}

export function getPublicCalendar(token: string): PublicCalendarRecord | null {
	return storeState().publicCalendarsByToken.get(token) ?? null;
}

export function getPublicCalendarRecord(token: string): { calendar: CalendarRecord; public: PublicCalendarRecord } | null {
	const published = getPublicCalendar(token);

	if (!published) {
		return null;
	}

	const calendar = [...storeState().calendarsByKey.values()].find((entry) => entry.id === published.calendarId);

	if (!calendar) {
		return null;
	}

	return { calendar, public: published };
}

export function isPublicCalendarVisible(token: string): boolean {
	const published = getPublicCalendar(token);

	if (!published) {
		return false;
	}

	const hideDisabled = process.env.NC_HIDE_DISABLED_USER_SHARES !== 'false';

	if (!hideDisabled) {
		return true;
	}

	if (!published.ownerEnabled) {
		return false;
	}

	return userExists(published.ownerUserId);
}

export function resolveRemotePrincipalUri(cloudId: string): string | null {
	const remote = findRemoteUserPrincipalByCloudId(cloudId);

	if (!remote) {
		return null;
	}

	return remote.uri;
}

export function resolveSystemResourcePrincipalUri(id: string): string | null {
	const resource = findCalendarResourcePrincipal(id);

	if (!resource) {
		return null;
	}

	return resource.uri;
}

export function resolveSystemRoomPrincipalUri(id: string): string | null {
	const room = findCalendarRoomPrincipal(id);

	if (!room) {
		return null;
	}

	return room.uri;
}

export function seedUserCalendar(userId: string, calendarUri: string, displayName?: string): CalendarRecord {
	return createCalendar(principalUriForUser(userId), calendarUri, displayName);
}

export function seedPublicCalendar(
	token: string,
	ownerUserId: string,
	calendarUri: string,
	options: { ownerEnabled?: boolean; displayName?: string } = {},
): PublicCalendarRecord {
	const calendar = seedUserCalendar(ownerUserId, calendarUri, options.displayName);
	const record: PublicCalendarRecord = {
		token,
		calendarId: calendar.id,
		ownerUserId,
		ownerEnabled: options.ownerEnabled ?? true,
	};

	storeState().publicCalendarsByToken.set(token, record);

	return record;
}

export function seedRemoteCalendar(remoteId: string, cloudId: string, calendarUri: string): CalendarRecord {
	return createCalendar(principalUriForRemoteUser(remoteId), calendarUri, calendarUri);
}

export function seedSystemResourceCalendar(resourceId: string, calendarUri: string): CalendarRecord {
	return createCalendar(principalUriForResource(resourceId), calendarUri, calendarUri);
}

export function seedSystemRoomCalendar(roomId: string, calendarUri: string): CalendarRecord {
	return createCalendar(principalUriForRoom(roomId), calendarUri, calendarUri);
}

export function resetCalendarsStore(): void {
	const state = storeState();

	state.calendarsByKey.clear();
	state.publicCalendarsByToken.clear();
	state.nextCalendarId = 1;
}
