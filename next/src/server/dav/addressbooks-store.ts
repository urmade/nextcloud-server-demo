import { findParityUser } from '@/src/server/config/users';

export interface VCardRecord {
	uri: string;
	content: string;
	etag: string;
	size: number;
	contentType: string;
}

export interface AddressBookRecord {
	id: number;
	uri: string;
	principalUri: string;
	displayName: string;
	vcards: Map<string, VCardRecord>;
}

interface AddressBooksStoreState {
	booksByKey: Map<string, AddressBookRecord>;
	nextBookId: number;
}

const globalState = globalThis as typeof globalThis & {
	__ncDavAddressBooksStore?: AddressBooksStoreState;
};

function storeState(): AddressBooksStoreState {
	if (!globalState.__ncDavAddressBooksStore) {
		globalState.__ncDavAddressBooksStore = {
			booksByKey: new Map(),
			nextBookId: 1,
		};
	}

	return globalState.__ncDavAddressBooksStore;
}

function bookKey(principalUri: string, uri: string): string {
	return `${principalUri}/${uri}`;
}

export function principalUriForUser(userId: string): string {
	return `principals/users/${userId}`;
}

export function principalUriForSystem(name: string): string {
	return `principals/system/${name}`;
}

export function userExists(userId: string): boolean {
	return findParityUser(userId) !== null;
}

export function getAddressBooksForPrincipal(principalUri: string): AddressBookRecord[] {
	const { booksByKey } = storeState();

	return [...booksByKey.values()].filter((book) => book.principalUri === principalUri);
}

export function getAddressBook(principalUri: string, uri: string): AddressBookRecord | null {
	return storeState().booksByKey.get(bookKey(principalUri, uri)) ?? null;
}

export function createAddressBook(principalUri: string, uri: string, displayName?: string): AddressBookRecord {
	const state = storeState();
	const record: AddressBookRecord = {
		id: state.nextBookId++,
		uri,
		principalUri,
		displayName: displayName ?? uri,
		vcards: new Map(),
	};

	state.booksByKey.set(bookKey(principalUri, uri), record);

	return record;
}

export function putVCard(
	principalUri: string,
	bookUri: string,
	vcardUri: string,
	content: string,
	contentType = 'text/vcard; charset=utf-8',
): VCardRecord | 'not-found' {
	let book = getAddressBook(principalUri, bookUri);

	if (!book) {
		book = createAddressBook(principalUri, bookUri);
	}

	const etag = `"${Buffer.from(content).toString('base64').slice(0, 16)}"`;
	const record: VCardRecord = {
		uri: vcardUri,
		content,
		etag,
		size: Buffer.byteLength(content, 'utf8'),
		contentType,
	};

	book.vcards.set(vcardUri, record);

	return record;
}

export function getVCard(
	principalUri: string,
	bookUri: string,
	vcardUri: string,
): VCardRecord | null {
	return getAddressBook(principalUri, bookUri)?.vcards.get(vcardUri) ?? null;
}

export function seedUserAddressBook(userId: string, bookUri: string, displayName?: string): AddressBookRecord {
	return createAddressBook(principalUriForUser(userId), bookUri, displayName);
}

export function seedSystemAddressBook(principalName: string, bookUri: string, displayName?: string): AddressBookRecord {
	return createAddressBook(principalUriForSystem(principalName), bookUri, displayName);
}

export function ensureSystemAddressBook(): AddressBookRecord {
	const existing = getAddressBook(principalUriForSystem('system'), 'system');

	if (existing) {
		return existing;
	}

	return seedSystemAddressBook('system', 'system', 'system');
}

export function resetAddressBooksStore(): void {
	const state = storeState();

	state.booksByKey.clear();
	state.nextBookId = 1;
}
