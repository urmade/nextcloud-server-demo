import { randomBytes } from 'node:crypto';

export interface StoredAppPassword {
	userId: string;
	loginName: string;
	token: string;
	userAgent: string;
	oneTime?: boolean;
}

const TOKEN_LENGTH = 72;
const TOKEN_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const PASSWORD_CONFIRM_WINDOW_SECONDS = 30 * 60 + 15;

const globalForAppPasswords = globalThis as typeof globalThis & {
	__ncAppPasswordTokens?: Map<string, StoredAppPassword>;
};

function getTokenMap(): Map<string, StoredAppPassword> {
	if (!globalForAppPasswords.__ncAppPasswordTokens) {
		globalForAppPasswords.__ncAppPasswordTokens = new Map();
	}

	return globalForAppPasswords.__ncAppPasswordTokens;
}

export function isAppPasswordTokenFormat(value: string): boolean {
	return value.length === TOKEN_LENGTH && /^[A-Za-z0-9]+$/.test(value);
}

export function generateAppPasswordToken(): string {
	const bytes = randomBytes(TOKEN_LENGTH);
	let token = '';

	for (let index = 0; index < TOKEN_LENGTH; index += 1) {
		token += TOKEN_CHARSET[bytes[index] % TOKEN_CHARSET.length];
	}

	return token;
}

export function storeAppPasswordToken(
	userId: string,
	loginName: string,
	token: string,
	userAgent: string,
	oneTime = false,
): StoredAppPassword {
	const stored: StoredAppPassword = {
		userId,
		loginName,
		token,
		userAgent,
		oneTime,
	};

	getTokenMap().set(token, stored);

	return stored;
}

export function storeOneTimeParityToken(userId: string, loginName: string, token: string): StoredAppPassword {
	return storeAppPasswordToken(userId, loginName, token, 'parity-one-time', true);
}

export function lookupAppPasswordToken(token: string): StoredAppPassword | null {
	return getTokenMap().get(token) ?? null;
}

export function rotateAppPasswordToken(oldToken: string, newToken: string): StoredAppPassword | null {
	const existing = getTokenMap().get(oldToken);

	if (!existing) {
		return null;
	}

	getTokenMap().delete(oldToken);

	return storeAppPasswordToken(existing.userId, existing.loginName, newToken, existing.userAgent);
}

export function invalidateAppPasswordToken(token: string): boolean {
	return getTokenMap().delete(token);
}

export function isPasswordConfirmationFresh(lastPasswordConfirm: number | undefined, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
	if (lastPasswordConfirm === undefined) {
		return false;
	}

	return lastPasswordConfirm >= nowSeconds - PASSWORD_CONFIRM_WINDOW_SECONDS;
}

export function resetAppPasswordStore(): void {
	getTokenMap().clear();
}
