import { findParityUser } from '@/src/server/config/users';

export interface OutOfOfficeAbsence {
	id: number;
	userId: string;
	firstDay: string;
	lastDay: string;
	status: string;
	message: string;
	replacementUserId: string | null;
	replacementUserDisplayName: string | null;
}

export interface OutOfOfficeCurrentData {
	id: string;
	userId: string;
	startDate: number;
	endDate: number;
	shortMessage: string;
	message: string;
	replacementUserId: string | null;
	replacementUserDisplayName: string | null;
}

export interface OutOfOfficeConfiguredData {
	id: number;
	userId: string;
	firstDay: string;
	lastDay: string;
	status: string;
	message: string;
	replacementUserId: string | null;
	replacementUserDisplayName: string | null;
}

const absencesByUserId = new Map<string, OutOfOfficeAbsence>();
let nextAbsenceId = 1;

const DEFAULT_TIMEZONE = 'UTC';

function parseDayStartTimestamp(day: string, timezone = DEFAULT_TIMEZONE): number {
	const date = new Date(`${day}T00:00:00`);

	if (timezone !== 'UTC') {
		return Math.floor(date.getTime() / 1000);
	}

	return Math.floor(Date.parse(`${day}T00:00:00Z`) / 1000);
}

function parseDayEndTimestamp(day: string, timezone = DEFAULT_TIMEZONE): number {
	if (timezone === 'UTC') {
		return Math.floor(Date.parse(`${day}T23:59:00Z`) / 1000);
	}

	const date = new Date(`${day}T23:59:00`);

	return Math.floor(date.getTime() / 1000);
}

export function toCurrentOutOfOfficeData(absence: OutOfOfficeAbsence): OutOfOfficeCurrentData {
	return {
		id: String(absence.id),
		userId: absence.userId,
		startDate: parseDayStartTimestamp(absence.firstDay),
		endDate: parseDayEndTimestamp(absence.lastDay),
		shortMessage: absence.status,
		message: absence.message,
		replacementUserId: absence.replacementUserId,
		replacementUserDisplayName: absence.replacementUserDisplayName,
	};
}

export function toConfiguredOutOfOfficeData(absence: OutOfOfficeAbsence): OutOfOfficeConfiguredData {
	return {
		id: absence.id,
		userId: absence.userId,
		firstDay: absence.firstDay,
		lastDay: absence.lastDay,
		status: absence.status,
		message: absence.message,
		replacementUserId: absence.replacementUserId,
		replacementUserDisplayName: absence.replacementUserDisplayName,
	};
}

export function isAbsenceInEffect(absence: OutOfOfficeAbsence, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
	const current = toCurrentOutOfOfficeData(absence);

	return current.startDate <= nowSeconds && current.endDate >= nowSeconds;
}

export function getAbsence(userId: string): OutOfOfficeAbsence | null {
	return absencesByUserId.get(userId) ?? null;
}

export function getCurrentAbsence(userId: string): OutOfOfficeCurrentData | null {
	if (!findParityUser(userId)) {
		return null;
	}

	const absence = getAbsence(userId);

	if (!absence || !isAbsenceInEffect(absence)) {
		return null;
	}

	return toCurrentOutOfOfficeData(absence);
}

export function createOrUpdateAbsence(
	userId: string,
	firstDay: string,
	lastDay: string,
	status: string,
	message: string,
	replacementUserId: string | null,
	replacementUserDisplayName: string | null,
): OutOfOfficeAbsence {
	const existing = absencesByUserId.get(userId);
	const absence: OutOfOfficeAbsence = {
		id: existing?.id ?? nextAbsenceId++,
		userId,
		firstDay,
		lastDay,
		status,
		message,
		replacementUserId,
		replacementUserDisplayName,
	};

	absencesByUserId.set(userId, absence);

	return absence;
}

export function clearAbsence(userId: string): void {
	absencesByUserId.delete(userId);
}

export function resetOutOfOfficeStore(): void {
	absencesByUserId.clear();
	nextAbsenceId = 1;
}
