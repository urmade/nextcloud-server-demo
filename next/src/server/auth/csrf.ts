import { randomBytes } from 'node:crypto';

const TOKEN_LENGTH = 32;

function generateRawToken(): string {
	return randomBytes(TOKEN_LENGTH).toString('hex');
}

export function encryptCsrfToken(value: string): string {
	const sharedSecret = randomBytes(value.length);
	const obfuscated = Buffer.alloc(value.length);

	for (let index = 0; index < value.length; index += 1) {
		obfuscated[index] = value.charCodeAt(index) ^ sharedSecret[index];
	}

	return `${obfuscated.toString('base64')}:${sharedSecret.toString('base64')}`;
}

export function decryptCsrfToken(encrypted: string): string {
	const parts = encrypted.split(':');

	if (parts.length !== 2) {
		return '';
	}

	try {
		const obfuscated = Buffer.from(parts[0], 'base64');
		const secret = Buffer.from(parts[1], 'base64');
		const decrypted = Buffer.alloc(obfuscated.length);

		for (let index = 0; index < obfuscated.length; index += 1) {
			decrypted[index] = obfuscated[index] ^ secret[index];
		}

		return decrypted.toString('utf8');
	} catch {
		return '';
	}
}

export function createCsrfToken(): { raw: string; encrypted: string } {
	const raw = generateRawToken();

	return {
		raw,
		encrypted: encryptCsrfToken(raw),
	};
}

export function isCsrfTokenValid(storedRaw: string | undefined, provided: string): boolean {
	if (!storedRaw || !provided) {
		return false;
	}

	const decrypted = decryptCsrfToken(provided);

	if (decrypted === '') {
		return storedRaw === provided;
	}

	return storedRaw === decrypted;
}
