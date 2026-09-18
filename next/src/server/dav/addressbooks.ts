import { parseDepthHeader } from './files';
import {
	createAddressBook,
	ensureSystemAddressBook,
	getAddressBook,
	getAddressBooksForPrincipal,
	getVCard,
	principalUriForSystem,
	principalUriForUser,
	putVCard,
	userExists,
	type AddressBookRecord,
	type VCardRecord,
} from './addressbooks-store';
import { buildDavHref, ingressBasePath, isLegacyCardDavIngress } from './remote';
import type { ParsedDavRequest } from './types';
import {
	buildAddressBookPropfindMultistatus,
	buildForbiddenXml,
	buildMethodNotAllowedXml,
	buildNotFoundXml,
} from './xml';

export type AddressBookTreeKind = 'users' | 'system';

export interface ParsedAddressBookPath {
	kind: AddressBookTreeKind;
	requestPath: string;
	userId?: string;
	systemPrincipalName?: string;
	bookUri?: string;
	vcardUri?: string;
	isRootHome: boolean;
	isPrincipalHome: boolean;
	addressBookBasePath?: string;
}

function splitSegments(path: string): string[] {
	return path.split('/').filter(Boolean);
}

export function isAddressBookDavPath(davPath: string): boolean {
	const root = davPath.split('/').filter(Boolean)[0];

	return root === 'addressbooks';
}

function objectLooksLikeFile(segment: string | undefined): boolean {
	return Boolean(segment?.includes('.'));
}

function parseLegacyUserAddressBookPath(parsed: ParsedDavRequest): ParsedAddressBookPath | null {
	if (!isLegacyCardDavIngress(parsed.ingress)) {
		return null;
	}

	const segments = splitSegments(parsed.davPath);

	if (segments[0] !== 'principals' || segments[1] !== 'users' || segments[3] !== 'addressbooks') {
		return null;
	}

	const userId = segments[2];

	if (!userId) {
		return null;
	}

	const bookUri = segments[4];
	const vcardUri = segments[5];
	const addressBookBasePath = `${ingressBasePath(parsed.ingress)}/principals/users/${userId}/addressbooks`;

	return {
		kind: 'users',
		userId,
		bookUri,
		vcardUri,
		isRootHome: false,
		isPrincipalHome: !bookUri,
		requestPath: buildDavHref(
			parsed.requestPath,
			!bookUri || (!vcardUri && !objectLooksLikeFile(bookUri)),
		),
		addressBookBasePath,
	};
}

export function parseAddressBookPath(parsed: ParsedDavRequest): ParsedAddressBookPath | null {
	const legacyPath = parseLegacyUserAddressBookPath(parsed);

	if (legacyPath) {
		return legacyPath;
	}

	const segments = splitSegments(parsed.davPath);

	if (segments[0] !== 'addressbooks') {
		return null;
	}

	const kind = segments[1];

	if (kind === 'users') {
		const userId = segments[2];

		if (!userId) {
			return {
				kind: 'users',
				isRootHome: true,
				isPrincipalHome: false,
				requestPath: buildDavHref(parsed.requestPath, true),
			};
		}

		const bookUri = segments[3];
		const vcardUri = segments[4];

		return {
			kind: 'users',
			userId,
			bookUri,
			vcardUri,
			isRootHome: false,
			isPrincipalHome: !bookUri,
			requestPath: buildDavHref(
				parsed.requestPath,
				!bookUri || (!vcardUri && !objectLooksLikeFile(bookUri)),
			),
		};
	}

	if (kind === 'system') {
		const systemPrincipalName = segments[2];

		if (!systemPrincipalName) {
			return {
				kind: 'system',
				isRootHome: true,
				isPrincipalHome: false,
				requestPath: buildDavHref(parsed.requestPath, true),
			};
		}

		const bookUri = segments[3];
		const vcardUri = segments[4];

		return {
			kind: 'system',
			systemPrincipalName,
			bookUri,
			vcardUri,
			isRootHome: false,
			isPrincipalHome: !bookUri,
			requestPath: buildDavHref(
				parsed.requestPath,
				!bookUri || (!vcardUri && !objectLooksLikeFile(bookUri)),
			),
		};
	}

	return null;
}

export function parseAddressBookDepth(request: Request): number {
	const depthHeader = request.headers.get('depth') ?? request.headers.get('Depth');
	const depth = parseDepthHeader(depthHeader);

	if (Number.isFinite(depth) && depth > 1) {
		return 1;
	}

	return depth;
}

function resolvePrincipalUri(parsed: ParsedAddressBookPath): string | null {
	if (parsed.kind === 'users' && parsed.userId) {
		return principalUriForUser(parsed.userId);
	}

	if (parsed.kind === 'system' && parsed.systemPrincipalName) {
		return principalUriForSystem(parsed.systemPrincipalName);
	}

	return null;
}

function canAccessUserAddressBookHome(sessionUserId: string, targetUserId: string): 'own' | 'empty' | 'missing' {
	if (!userExists(targetUserId)) {
		return 'missing';
	}

	if (sessionUserId === targetUserId) {
		return 'own';
	}

	return 'empty';
}

function userBookHref(userId: string, bookUri: string, addressBookBasePath?: string): string {
	if (addressBookBasePath) {
		return buildDavHref(`${addressBookBasePath}/${bookUri}`, true);
	}

	return buildDavHref(`/remote.php/dav/addressbooks/users/${userId}/${bookUri}/`, true);
}

function systemBookHref(principalName: string, bookUri: string): string {
	return buildDavHref(`/remote.php/dav/addressbooks/system/${principalName}/${bookUri}/`, true);
}

function bookToPropfindEntry(book: AddressBookRecord, href: string, isCollection: boolean) {
	return {
		href,
		displayName: book.displayName,
		isCollection,
		isAddressBook: isCollection,
		etag: `"book-${book.id}"`,
		size: 0,
		contentType: isCollection ? undefined : 'text/vcard; charset=utf-8',
	};
}

function vcardToPropfindEntry(vcard: VCardRecord, href: string) {
	return {
		href,
		displayName: vcard.uri,
		isCollection: false,
		isAddressBook: false,
		etag: vcard.etag,
		size: vcard.size,
		contentType: vcard.contentType,
	};
}

type AddressBookPropfindEntry = Parameters<typeof buildAddressBookPropfindMultistatus>[0][number];

function resolveReadableBook(
	parsed: ParsedAddressBookPath,
	sessionUserId: string,
): { book: AddressBookRecord; href: string } | 'not-found' | 'forbidden' {
	if (parsed.kind === 'users') {
		const access = canAccessUserAddressBookHome(sessionUserId, parsed.userId ?? '');

		if (access === 'missing' || parsed.isPrincipalHome || parsed.isRootHome) {
			return 'not-found';
		}

		if (!parsed.bookUri) {
			return 'not-found';
		}

		if (access === 'empty') {
			return 'not-found';
		}

		const principalUri = resolvePrincipalUri(parsed);

		if (!principalUri) {
			return 'not-found';
		}

		const book = getAddressBook(principalUri, parsed.bookUri);

		if (!book) {
			return 'not-found';
		}

		return {
			book,
			href: userBookHref(parsed.userId!, parsed.bookUri, parsed.addressBookBasePath),
		};
	}

	if (parsed.kind === 'system') {
		if (parsed.isRootHome || parsed.isPrincipalHome || !parsed.bookUri) {
			return 'not-found';
		}

		const principalUri = resolvePrincipalUri(parsed);

		if (!principalUri) {
			return 'not-found';
		}

		const book = parsed.systemPrincipalName === 'system' && parsed.bookUri === 'system'
			? ensureSystemAddressBook()
			: getAddressBook(principalUri, parsed.bookUri);

		if (!book) {
			return 'not-found';
		}

		return {
			book,
			href: systemBookHref(parsed.systemPrincipalName!, parsed.bookUri),
		};
	}

	return 'not-found';
}

export function buildAddressBookPropfindBody(
	parsed: ParsedAddressBookPath,
	depth: number,
	sessionUserId: string,
): string | 'not-found' | 'forbidden' {
	if (parsed.kind === 'users') {
		const access = canAccessUserAddressBookHome(sessionUserId, parsed.userId ?? '');

		if (access === 'missing') {
			return 'not-found';
		}

		if (parsed.isRootHome) {
			return buildAddressBookPropfindMultistatus([{
				href: buildDavHref('/remote.php/dav/addressbooks/users/', true),
				displayName: 'users',
				isCollection: true,
				isAddressBook: false,
			}]);
		}

		if (parsed.isPrincipalHome) {
			const principalHomeHref = parsed.addressBookBasePath
				? buildDavHref(parsed.addressBookBasePath, true)
				: buildDavHref(`/remote.php/dav/addressbooks/users/${parsed.userId}/`, true);
			const responses: AddressBookPropfindEntry[] = [{
				href: principalHomeHref,
				displayName: parsed.userId ?? '',
				isCollection: true,
				isAddressBook: false,
			}];

			if (depth >= 1 && access === 'own') {
				const principalUri = resolvePrincipalUri(parsed) ?? '';

				for (const book of getAddressBooksForPrincipal(principalUri)) {
					responses.push(bookToPropfindEntry(
						book,
						userBookHref(parsed.userId!, book.uri, parsed.addressBookBasePath),
						true,
					));
				}
			}

			return buildAddressBookPropfindMultistatus(responses);
		}

		const resolved = resolveReadableBook(parsed, sessionUserId);

		if (resolved === 'not-found') {
			return 'not-found';
		}

		if (resolved === 'forbidden') {
			return 'forbidden';
		}

		const { book, href } = resolved;

		if (parsed.vcardUri) {
			const vcard = book.vcards.get(parsed.vcardUri);

			if (!vcard) {
				return 'not-found';
			}

			return buildAddressBookPropfindMultistatus([vcardToPropfindEntry(vcard, parsed.requestPath)]);
		}

		const responses: AddressBookPropfindEntry[] = [bookToPropfindEntry(book, href, true)];

		if (depth >= 1) {
			for (const vcard of book.vcards.values()) {
				responses.push(vcardToPropfindEntry(vcard, `${href}${vcard.uri}`));
			}
		}

		return buildAddressBookPropfindMultistatus(responses);
	}

	if (parsed.kind === 'system') {
		if (parsed.isRootHome) {
			return buildAddressBookPropfindMultistatus([{
				href: buildDavHref('/remote.php/dav/addressbooks/system/', true),
				displayName: 'system',
				isCollection: true,
				isAddressBook: false,
			}]);
		}

		if (parsed.isPrincipalHome) {
			return buildAddressBookPropfindMultistatus([{
				href: buildDavHref(`/remote.php/dav/addressbooks/system/${parsed.systemPrincipalName}/`, true),
				displayName: parsed.systemPrincipalName ?? '',
				isCollection: true,
				isAddressBook: false,
			}]);
		}

		const resolved = resolveReadableBook(parsed, sessionUserId);

		if (resolved === 'not-found' || resolved === 'forbidden') {
			return 'not-found';
		}

		const { book, href } = resolved;

		if (parsed.vcardUri) {
			const vcard = book.vcards.get(parsed.vcardUri);

			if (!vcard) {
				return 'not-found';
			}

			return buildAddressBookPropfindMultistatus([vcardToPropfindEntry(vcard, parsed.requestPath)]);
		}

		const responses: AddressBookPropfindEntry[] = [bookToPropfindEntry(book, href, true)];

		if (depth >= 1) {
			for (const vcard of book.vcards.values()) {
				responses.push(vcardToPropfindEntry(vcard, `${href}${vcard.uri}`));
			}
		}

		return buildAddressBookPropfindMultistatus(responses);
	}

	return 'not-found';
}

export async function handleAddressBookPut(
	request: Request,
	parsed: ParsedAddressBookPath,
	sessionUserId: string,
): Promise<Response | 'not-found' | 'forbidden'> {
	if (parsed.kind === 'users') {
		if (!parsed.userId || !parsed.bookUri || !parsed.vcardUri || parsed.isPrincipalHome || parsed.isRootHome) {
			return 'not-found';
		}

		if (sessionUserId !== parsed.userId) {
			return 'not-found';
		}

		const principalUri = resolvePrincipalUri(parsed);

		if (!principalUri) {
			return 'not-found';
		}

		const content = Buffer.from(await request.arrayBuffer()).toString('utf8');
		const result = putVCard(principalUri, parsed.bookUri, parsed.vcardUri, content);

		if (result === 'not-found') {
			return 'not-found';
		}

		return new Response(null, {
			status: 201,
			headers: {
				'content-length': '0',
				etag: result.etag,
				'x-user-id': sessionUserId,
			},
		});
	}

	if (parsed.kind === 'system') {
		return 'forbidden';
	}

	return 'not-found';
}

export function handleAddressBookGet(
	parsed: ParsedAddressBookPath,
	sessionUserId: string,
): Response | 'not-found' | 'forbidden' {
	if (!parsed.vcardUri || !parsed.bookUri) {
		return 'not-found';
	}

	if (parsed.kind === 'users') {
		if (!parsed.userId || sessionUserId !== parsed.userId) {
			return 'not-found';
		}

		const principalUri = resolvePrincipalUri(parsed);

		if (!principalUri) {
			return 'not-found';
		}

		const vcard = getVCard(principalUri, parsed.bookUri, parsed.vcardUri);

		if (!vcard) {
			return 'not-found';
		}

		return new Response(vcard.content, {
			status: 200,
			headers: {
				'content-type': vcard.contentType,
				'content-length': String(vcard.size),
				etag: vcard.etag,
				'x-user-id': sessionUserId,
			},
		});
	}

	if (parsed.kind === 'system') {
		const principalUri = resolvePrincipalUri(parsed);

		if (!principalUri) {
			return 'not-found';
		}

		const book = parsed.systemPrincipalName === 'system' && parsed.bookUri === 'system'
			? ensureSystemAddressBook()
			: getAddressBook(principalUri, parsed.bookUri);

		const vcard = book?.vcards.get(parsed.vcardUri);

		if (!vcard) {
			return 'not-found';
		}

		return new Response(vcard.content, {
			status: 200,
			headers: {
				'content-type': vcard.contentType,
				'content-length': String(vcard.size),
				etag: vcard.etag,
				'x-user-id': sessionUserId,
			},
		});
	}

	return 'not-found';
}

export function addressBookNotFoundResponse(message = 'File not found'): Response {
	return new Response(buildNotFoundXml(message), {
		status: 404,
		headers: {
			'content-type': 'application/xml; charset=utf-8',
		},
	});
}

export function addressBookForbiddenResponse(): Response {
	return new Response(buildForbiddenXml('Permission denied'), {
		status: 403,
		headers: {
			'content-type': 'application/xml; charset=utf-8',
		},
	});
}

export function addressBookMethodNotAllowedResponse(message: string): Response {
	return new Response(buildMethodNotAllowedXml(message), {
		status: 405,
		headers: {
			'content-type': 'application/xml; charset=utf-8',
		},
	});
}
