export interface DirectLinkRecord {
	token: string;
	userId: string;
	fileId: number;
	expiration: number;
}

const TOKEN_LENGTH = 60;
const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

let directLinks = new Map<string, DirectLinkRecord>();

function generateToken(): string {
	const bytes = new Uint8Array(TOKEN_LENGTH);
	crypto.getRandomValues(bytes);

	let token = '';

	for (let index = 0; index < TOKEN_LENGTH; index += 1) {
		token += TOKEN_ALPHABET[bytes[index] % TOKEN_ALPHABET.length];
	}

	return token;
}

export function mintDirectLink(
	userId: string,
	fileId: number,
	expirationTimeSeconds: number,
	nowSeconds = Math.floor(Date.now() / 1000),
): DirectLinkRecord {
	const token = generateToken();
	const record: DirectLinkRecord = {
		token,
		userId,
		fileId,
		expiration: nowSeconds + expirationTimeSeconds,
	};

	directLinks.set(token, record);

	return record;
}

export function getDirectLinkByToken(token: string): DirectLinkRecord | null {
	return directLinks.get(token) ?? null;
}

export function resetDirectLinkStore(): void {
	directLinks = new Map();
}
