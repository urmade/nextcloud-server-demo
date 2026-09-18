import { getParityUsers } from '@/src/server/config/users';

export const STATUS_WCF_UNKNOWN = 0;
export const STATUS_WCF_SCHEDULED = 1;
export const STATUS_WCF_RUNNING = 2;
export const STATUS_WCF_DONE = 3;
export const STATUS_WCF_ERROR = 4;

const WINDOWS_EXTENSION = [' ', '.'];

const WINDOWS_BASENAMES = [
	'con', 'prn', 'aux', 'nul', 'com0', 'com1', 'com2', 'com3', 'com4', 'com5',
	'com6', 'com7', 'com8', 'com9', 'com¹', 'com²', 'com³', 'lpt0', 'lpt1', 'lpt2',
	'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9', 'lpt¹', 'lpt²', 'lpt³',
];

const WINDOWS_CHARACTERS = ['<', '>', ':', '"', '|', '?', '*'];

export type SanitizationErrors = Record<string, string[]> | [];

export interface SanitizationStatus {
	status: number;
	processed: number;
	total: number;
	errors: SanitizationErrors;
}

interface FilenamesStoreState {
	forbiddenBasenames: string[];
	forbiddenCharacters: string[];
	forbiddenExtensions: string[];
	sanitizeStatus: number;
	sanitizeIndex: number;
	sanitizeErrors: Record<string, string[]>;
	sanitizationJobActive: boolean;
}

const DEFAULT_EXTENSIONS = ['.part', '.filepart'];

let store: FilenamesStoreState = createDefaultStore();

function createDefaultStore(): FilenamesStoreState {
	return {
		forbiddenBasenames: [],
		forbiddenCharacters: [],
		forbiddenExtensions: [...DEFAULT_EXTENSIONS],
		sanitizeStatus: STATUS_WCF_UNKNOWN,
		sanitizeIndex: -1,
		sanitizeErrors: {},
		sanitizationJobActive: false,
	};
}

function uniqueSorted(values: string[]): string[] {
	return [...new Set(values)].sort();
}

function includesAll(haystack: string[], needles: string[]): boolean {
	return needles.every((needle) => haystack.includes(needle));
}

export function resetFilenamesStore(): void {
	store = createDefaultStore();
}

export function hasFilesWindowsSupport(): boolean {
	return includesAll(store.forbiddenBasenames, WINDOWS_BASENAMES)
		&& includesAll(store.forbiddenCharacters, WINDOWS_CHARACTERS)
		&& includesAll(store.forbiddenExtensions, WINDOWS_EXTENSION);
}

export function setFilesWindowsSupport(enabled: boolean): void {
	if (enabled) {
		store.forbiddenBasenames = uniqueSorted([...WINDOWS_BASENAMES, ...store.forbiddenBasenames]);
		store.forbiddenCharacters = uniqueSorted([...WINDOWS_CHARACTERS, ...store.forbiddenCharacters]);
		store.forbiddenExtensions = uniqueSorted([...WINDOWS_EXTENSION, ...store.forbiddenExtensions]);
	} else {
		store.forbiddenBasenames = uniqueSorted(
			store.forbiddenBasenames.filter((value) => !WINDOWS_BASENAMES.includes(value)),
		);
		store.forbiddenCharacters = uniqueSorted(
			store.forbiddenCharacters.filter((value) => !WINDOWS_CHARACTERS.includes(value)),
		);
		store.forbiddenExtensions = uniqueSorted(
			store.forbiddenExtensions.filter((value) => !WINDOWS_EXTENSION.includes(value)),
		);
	}

	clearSanitizationState();
}

function clearSanitizationState(): void {
	store.sanitizeStatus = STATUS_WCF_UNKNOWN;
	store.sanitizeIndex = -1;
	store.sanitizeErrors = {};
	store.sanitizationJobActive = false;
}

export function isFilenameSanitizationRunning(): boolean {
	return store.sanitizationJobActive;
}

export function getSanitizationStatus(): SanitizationStatus {
	let status = store.sanitizeStatus;

	if (status === STATUS_WCF_UNKNOWN && store.sanitizationJobActive) {
		status = STATUS_WCF_SCHEDULED;
	}

	const errorEntries = Object.entries(store.sanitizeErrors);

	return {
		status,
		processed: store.sanitizeIndex,
		total: getParityUsers().length,
		errors: errorEntries.length === 0 ? [] : Object.fromEntries(errorEntries),
	};
}

export function scheduleSanitization(limit: number, charReplacement: string | null): void {
	store.sanitizationJobActive = true;
	void limit;
	void charReplacement;
}

export function stopSanitizationJob(): void {
	store.sanitizationJobActive = false;
}
