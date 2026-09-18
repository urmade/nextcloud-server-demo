import {
	putVCard,
	resetAddressBooksStore,
	seedSystemAddressBook,
	seedUserAddressBook,
} from '@/src/server/dav/addressbooks-store';
import { getParityEnv } from '../env';

interface SeedPayload {
	userBooks?: Array<{ userId: string; bookUri: string; displayName?: string }>;
	systemBooks?: Array<{ principalName: string; bookUri: string; displayName?: string }>;
	systemVcards?: Array<{ principalName: string; bookUri: string; vcardUri: string; content: string }>;
}

async function seedAddressBooksOnServer(payload: SeedPayload): Promise<void> {
	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/api/parity/seed-dav-addressbooks`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
		},
		body: JSON.stringify(payload),
	});

	if (!response.ok) {
		throw new Error(`Failed to seed DAV addressbooks store: ${response.status}`);
	}
}

function seedAddressBooksLocally(payload: SeedPayload): void {
	for (const entry of payload.userBooks ?? []) {
		seedUserAddressBook(entry.userId, entry.bookUri, entry.displayName);
	}

	for (const entry of payload.systemBooks ?? []) {
		seedSystemAddressBook(entry.principalName, entry.bookUri, entry.displayName);
	}

	for (const entry of payload.systemVcards ?? []) {
		const book = seedSystemAddressBook(entry.principalName, entry.bookUri);
		putVCard(book.principalUri, book.uri, entry.vcardUri, entry.content);
	}
}

async function seedAddressBooksOnBothSides(payload: SeedPayload): Promise<void> {
	seedAddressBooksLocally(payload);
	await seedAddressBooksOnServer(payload);
}

export async function resetParityAddressBooksStores(): Promise<void> {
	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/api/parity/reset-dav-addressbooks-store`, {
		method: 'POST',
	});

	if (!response.ok) {
		throw new Error(`Failed to reset DAV addressbooks store: ${response.status}`);
	}

	resetAddressBooksStore();
}

export async function seedParityUserAddressBook(userId: string, bookUri: string, displayName?: string) {
	await seedAddressBooksOnBothSides({
		userBooks: [{ userId, bookUri, displayName }],
	});
}

export async function seedParitySystemAddressBook(principalName: string, bookUri: string, displayName?: string) {
	await seedAddressBooksOnBothSides({
		systemBooks: [{ principalName, bookUri, displayName }],
	});
}

export async function seedParitySystemVCard(
	principalName: string,
	bookUri: string,
	vcardUri: string,
	content: string,
) {
	await seedAddressBooksOnBothSides({
		systemVcards: [{ principalName, bookUri, vcardUri, content }],
	});
}
