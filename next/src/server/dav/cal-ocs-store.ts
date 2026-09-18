export interface UpcomingEventData {
	uri: string;
	recurrenceId: number | null;
	calendarUri: string;
	start: number | null;
	summary: string | null;
	location: string | null;
	calendarAppUrl: string | null;
}

export interface PendingFederatedCalendarData {
	id: number;
	displayName: string;
	color: string | null;
	sharedBy: string;
	sharedByDisplayName: string;
	remoteUrl: string;
	permissions: number;
	components: string;
}

export const FEDERATED_CALENDAR_STATE_PENDING = 0;
export const FEDERATED_CALENDAR_STATE_ACCEPTED = 1;
export const FEDERATED_CALENDAR_STATE_DECLINED = 2;

interface FederatedCalendarRecord extends PendingFederatedCalendarData {
	principalUri: string;
	state: number;
}

const upcomingEventsByUserId = new Map<string, UpcomingEventData[]>();
const federatedCalendarsById = new Map<number, FederatedCalendarRecord>();
let nextFederatedCalendarId = 1;

function principalUriForUser(userId: string): string {
	return `principals/users/${userId}`;
}

export function getUpcomingEvents(userId: string, location: string | null = null): UpcomingEventData[] {
	const events = upcomingEventsByUserId.get(userId) ?? [];

	if (location === null || location === '') {
		return events.map((event) => ({ ...event }));
	}

	return events
		.filter((event) => event.location === location)
		.map((event) => ({ ...event }));
}

export function getPendingFederatedCalendars(userId: string): PendingFederatedCalendarData[] {
	const principalUri = principalUriForUser(userId);

	return [...federatedCalendarsById.values()]
		.filter((calendar) => calendar.principalUri === principalUri && calendar.state === FEDERATED_CALENDAR_STATE_PENDING)
		.map((calendar) => ({
			id: calendar.id,
			displayName: calendar.displayName,
			color: calendar.color,
			sharedBy: calendar.sharedBy,
			sharedByDisplayName: calendar.sharedByDisplayName,
			remoteUrl: calendar.remoteUrl,
			permissions: calendar.permissions,
			components: calendar.components,
		}));
}

export function findPendingFederatedCalendarForUser(id: number, userId: string): FederatedCalendarRecord | null {
	const calendar = federatedCalendarsById.get(id);

	if (!calendar) {
		return null;
	}

	if (calendar.principalUri !== principalUriForUser(userId) || calendar.state !== FEDERATED_CALENDAR_STATE_PENDING) {
		return null;
	}

	return calendar;
}

export function acceptPendingFederatedCalendar(id: number, userId: string): boolean {
	const calendar = findPendingFederatedCalendarForUser(id, userId);

	if (!calendar) {
		return false;
	}

	calendar.state = FEDERATED_CALENDAR_STATE_ACCEPTED;

	return true;
}

export function declinePendingFederatedCalendar(id: number, userId: string): boolean {
	const calendar = findPendingFederatedCalendarForUser(id, userId);

	if (!calendar) {
		return false;
	}

	calendar.state = FEDERATED_CALENDAR_STATE_DECLINED;

	return true;
}

export function seedUpcomingEvents(userId: string, events: UpcomingEventData[]): void {
	upcomingEventsByUserId.set(userId, events.map((event) => ({ ...event })));
}

export function seedPendingFederatedCalendar(
	userId: string,
	data: Omit<PendingFederatedCalendarData, 'id'>,
): PendingFederatedCalendarData {
	const id = nextFederatedCalendarId++;
	const record: FederatedCalendarRecord = {
		id,
		...data,
		principalUri: principalUriForUser(userId),
		state: FEDERATED_CALENDAR_STATE_PENDING,
	};

	federatedCalendarsById.set(id, record);

	return {
		id: record.id,
		displayName: record.displayName,
		color: record.color,
		sharedBy: record.sharedBy,
		sharedByDisplayName: record.sharedByDisplayName,
		remoteUrl: record.remoteUrl,
		permissions: record.permissions,
		components: record.components,
	};
}

export function resetCalOcsStore(): void {
	upcomingEventsByUserId.clear();
	federatedCalendarsById.clear();
	nextFederatedCalendarId = 1;
}
