import { getParityUsers } from '@/src/server/config/users';

const APP_NAME = 'dav';
const GENERATE_BIRTHDAY_CALENDAR_KEY = 'generateBirthdayCalendar';

let generateBirthdayCalendar = 'yes';
const pendingJobs = new Set<string>();
const birthdayCalendarsByUserId = new Set<string>();

export function isBirthdayCalendarEnabled(): boolean {
	return generateBirthdayCalendar === 'yes';
}

export function getPendingBirthdayCalendarJobs(): string[] {
	return [...pendingJobs];
}

export function hasBirthdayCalendar(userId: string): boolean {
	return birthdayCalendarsByUserId.has(userId);
}

export function enableBirthdayCalendar(): void {
	generateBirthdayCalendar = 'yes';
	pendingJobs.clear();

	for (const user of getParityUsers()) {
		pendingJobs.add(user.id);
	}
}

export function disableBirthdayCalendar(): void {
	generateBirthdayCalendar = 'no';
	pendingJobs.clear();
	birthdayCalendarsByUserId.clear();
}

export function completeBirthdayCalendarJob(userId: string): void {
	pendingJobs.delete(userId);
	birthdayCalendarsByUserId.add(userId);
}

export function resetBirthdayCalendarStore(): void {
	generateBirthdayCalendar = 'yes';
	pendingJobs.clear();
	birthdayCalendarsByUserId.clear();
}

export function getBirthdayCalendarAppValue(): string {
	return generateBirthdayCalendar;
}

export function getBirthdayCalendarConfigKey(): { app: string; key: string } {
	return {
		app: APP_NAME,
		key: GENERATE_BIRTHDAY_CALENDAR_KEY,
	};
}
