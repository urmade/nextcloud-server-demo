import { createHash, randomBytes } from 'node:crypto';

export const OPEN_LOCAL_TOKEN_LENGTH = 128;
export const OPEN_LOCAL_TOKEN_DURATION = 600;

export interface OpenLocalEditorEntry {
	userId: string;
	pathHash: string;
	token: string;
	expirationTime: number;
}

const entries: OpenLocalEditorEntry[] = [];

export function sha1Path(path: string): string {
	return createHash('sha1').update(path).digest('hex');
}

export function generateOpenLocalToken(): string {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	const bytes = randomBytes(OPEN_LOCAL_TOKEN_LENGTH);
	let token = '';

	for (let index = 0; index < OPEN_LOCAL_TOKEN_LENGTH; index += 1) {
		token += alphabet[bytes[index] % alphabet.length];
	}

	return token;
}

export function createOpenLocalEditorEntry(
	userId: string,
	path: string,
	nowSeconds: number,
): OpenLocalEditorEntry {
	const entry: OpenLocalEditorEntry = {
		userId,
		pathHash: sha1Path(path),
		token: generateOpenLocalToken(),
		expirationTime: nowSeconds + OPEN_LOCAL_TOKEN_DURATION,
	};

	entries.push(entry);

	return entry;
}

export function consumeOpenLocalEditorEntry(
	userId: string,
	path: string,
	token: string,
): OpenLocalEditorEntry | null {
	const pathHash = sha1Path(path);
	const index = entries.findIndex((entry) => (
		entry.userId === userId
		&& entry.pathHash === pathHash
		&& entry.token === token
	));

	if (index < 0) {
		return null;
	}

	const [entry] = entries.splice(index, 1);

	return entry;
}

export function resetOpenLocalEditorStore(): void {
	entries.length = 0;
}
