import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_NAME = 'dav';
const CREATE_EXAMPLE_EVENT_KEY = 'create_example_event';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const bundledContactPath = path.join(repoRoot, 'apps/dav/lib/ExampleContentFiles/exampleContact.vcf');

interface ExampleContentStoreState {
	defaultContactEnabled: boolean;
	defaultContactCard: string | null;
	defaultContactExists: boolean;
	createExampleEventEnabled: boolean;
	customExampleEventIcs: string | null;
}

const globalState = globalThis as typeof globalThis & {
	__ncDavExampleContentStore?: ExampleContentStoreState;
};

function storeState(): ExampleContentStoreState {
	if (!globalState.__ncDavExampleContentStore) {
		globalState.__ncDavExampleContentStore = {
			defaultContactEnabled: true,
			defaultContactCard: null,
			defaultContactExists: false,
			createExampleEventEnabled: true,
			customExampleEventIcs: null,
		};
	}

	return globalState.__ncDavExampleContentStore;
}

function readBundledContact(): string {
	return readFileSync(bundledContactPath, 'utf8');
}

function generateAlphanumericUid(length = 32): string {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	const bytes = randomBytes(length);
	let uid = '';

	for (let index = 0; index < length; index += 1) {
		uid += alphabet[bytes[index] % alphabet.length];
	}

	return uid;
}

function formatIcalDate(date: Date): string {
	const pad = (value: number) => String(value).padStart(2, '0');

	return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function getExampleEventDates(): { start: Date; end: Date } {
	const start = new Date();
	start.setDate(start.getDate() + 7);
	start.setHours(10, 0, 0, 0);

	const end = new Date();
	end.setDate(end.getDate() + 7);
	end.setHours(11, 0, 0, 0);

	return { start, end };
}

function defaultExampleEventDescription(): string {
	return `Welcome to Nextcloud Calendar!

This is a sample event - explore the flexibility of planning with Nextcloud Calendar by making any edits you want!

With Nextcloud Calendar, you can:
- Create, edit, and manage events effortlessly.
- Create multiple calendars and share them with teammates, friends, or family.
- Check availability and display your busy times to others.
- Seamlessly integrate with apps and devices via CalDAV.
- Customize your experience: schedule recurring events, adjust notifications and other settings.`;
}

function buildDefaultExampleEventIcs(uid: string): string {
	const { start, end } = getExampleEventDates();
	const now = new Date();
	const description = defaultExampleEventDescription().replace(/\n/g, '\\n');

	return [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//IDN nextcloud.com//Calendar app//EN',
		'BEGIN:VEVENT',
		`UID:${uid}`,
		`DTSTAMP:${formatIcalDate(now)}`,
		`DTSTART:${formatIcalDate(start)}`,
		`DTEND:${formatIcalDate(end)}`,
		'SUMMARY:Example event - open me!',
		`DESCRIPTION:${description}`,
		'END:VEVENT',
		'END:VCALENDAR',
	].join('\r\n');
}

function parseCustomEvent(ics: string): void {
	const normalized = ics.replace(/\r\n/g, '\n');

	if (!/^BEGIN:VCALENDAR/m.test(normalized) || !/^BEGIN:VEVENT/m.test(normalized)) {
		throw new Error('Custom event does not contain a VCALENDAR/VEVENT component');
	}
}

function transformCustomExampleEvent(ics: string, uid: string): string {
	const { start, end } = getExampleEventDates();
	const lines = ics.replace(/\r\n/g, '\n').split('\n');
	const output: string[] = [];
	let skipping = false;

	for (const line of lines) {
		const upper = line.toUpperCase();

		if (upper.startsWith('ORGANIZER') || upper.startsWith('ATTENDEE')) {
			continue;
		}

		if (upper.startsWith('UID')) {
			output.push(`UID:${uid}`);
			continue;
		}

		if (upper.startsWith('DTSTART')) {
			output.push(`DTSTART:${formatIcalDate(start)}`);
			continue;
		}

		if (upper.startsWith('DTEND')) {
			output.push(`DTEND:${formatIcalDate(end)}`);
			continue;
		}

		if (skipping) {
			if (line.startsWith(' ') || line.startsWith('\t')) {
				continue;
			}

			skipping = false;
		}

		if (upper.startsWith('ORGANIZER') || upper.startsWith('ATTENDEE')) {
			skipping = true;
			continue;
		}

		output.push(line);
	}

	return output.join('\r\n');
}

export function isDefaultContactEnabled(): boolean {
	return storeState().defaultContactEnabled;
}

export function setDefaultContactEnabled(value: boolean): void {
	storeState().defaultContactEnabled = value;
}

export function defaultContactExists(): boolean {
	return storeState().defaultContactExists;
}

export function getDefaultContactCard(): string | null {
	return storeState().defaultContactCard;
}

export function getDefaultContactDownload(): string {
	return storeState().defaultContactCard ?? readBundledContact();
}

export function createInitialDefaultContact(): void {
	if (storeState().defaultContactExists) {
		return;
	}

	storeState().defaultContactCard = readBundledContact();
	storeState().defaultContactExists = true;
}

export function setDefaultContactCard(contactData: string | null): void {
	const cardData = contactData ?? readBundledContact();
	storeState().defaultContactCard = cardData;
	storeState().defaultContactExists = true;
}

export function shouldCreateExampleEvent(): boolean {
	return storeState().createExampleEventEnabled;
}

export function setCreateExampleEventEnabled(enable: boolean): void {
	storeState().createExampleEventEnabled = enable;
}

export function getExampleEventIcs(): string {
	const state = storeState();
	const uid = generateAlphanumericUid();

	if (state.customExampleEventIcs === null) {
		return buildDefaultExampleEventIcs(uid);
	}

	return transformCustomExampleEvent(state.customExampleEventIcs, uid);
}

export function saveCustomExampleEvent(ics: string): void {
	parseCustomEvent(ics);
	storeState().customExampleEventIcs = ics;
}

export function deleteCustomExampleEvent(): void {
	storeState().customExampleEventIcs = null;
}

export function resetExampleContentStore(): void {
	globalState.__ncDavExampleContentStore = {
		defaultContactEnabled: true,
		defaultContactCard: null,
		defaultContactExists: false,
		createExampleEventEnabled: true,
		customExampleEventIcs: null,
	};
}

export function getCreateExampleEventConfigKey(): { app: string; key: string } {
	return {
		app: APP_NAME,
		key: CREATE_EXAMPLE_EVENT_KEY,
	};
}
