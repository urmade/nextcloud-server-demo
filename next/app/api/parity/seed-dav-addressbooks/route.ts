import {
	ensureSystemAddressBook,
	putVCard,
	seedSystemAddressBook,
	seedUserAddressBook,
} from '@/src/server/dav/addressbooks-store';

interface SeedPayload {
	userBooks?: Array<{ userId: string; bookUri: string; displayName?: string }>;
	systemBooks?: Array<{ principalName: string; bookUri: string; displayName?: string }>;
	systemVcards?: Array<{ principalName: string; bookUri: string; vcardUri: string; content: string }>;
}

export async function POST(request: Request): Promise<Response> {
	if (process.env.NC_PARITY_EXAPP !== 'true') {
		return new Response(null, { status: 404 });
	}

	const payload = await request.json() as SeedPayload;

	for (const entry of payload.userBooks ?? []) {
		seedUserAddressBook(entry.userId, entry.bookUri, entry.displayName);
	}

	for (const entry of payload.systemBooks ?? []) {
		if (entry.principalName === 'system' && entry.bookUri === 'system') {
			ensureSystemAddressBook();
		} else {
			seedSystemAddressBook(entry.principalName, entry.bookUri, entry.displayName);
		}
	}

	for (const entry of payload.systemVcards ?? []) {
		const book = entry.principalName === 'system' && entry.bookUri === 'system'
			? ensureSystemAddressBook()
			: seedSystemAddressBook(entry.principalName, entry.bookUri);

		putVCard(book.principalUri, book.uri, entry.vcardUri, entry.content);
	}

	return new Response(null, { status: 204 });
}
