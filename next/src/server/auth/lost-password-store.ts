import { createHash } from 'node:crypto';

export interface LostPasswordTokenRecord {
	userId: string;
	email: string;
	token: string;
	createdAt: number;
}

export interface CapturedLostPasswordMail {
	userId: string;
	email: string;
	token: string;
	resetFormUrl: string;
}

const globalForLostPassword = globalThis as typeof globalThis & {
	__ncLostPasswordTokens?: Map<string, LostPasswordTokenRecord>;
	__ncLostPasswordEmailCounts?: Map<string, number[]>;
	__ncLostPasswordMailCapture?: CapturedLostPasswordMail[];
	__ncLostPasswordLink?: string;
};

function getTokenMap(): Map<string, LostPasswordTokenRecord> {
	if (!globalForLostPassword.__ncLostPasswordTokens) {
		globalForLostPassword.__ncLostPasswordTokens = new Map();
	}

	return globalForLostPassword.__ncLostPasswordTokens;
}

function getEmailCountMap(): Map<string, number[]> {
	if (!globalForLostPassword.__ncLostPasswordEmailCounts) {
		globalForLostPassword.__ncLostPasswordEmailCounts = new Map();
	}

	return globalForLostPassword.__ncLostPasswordEmailCounts;
}

function getMailCapture(): CapturedLostPasswordMail[] {
	if (!globalForLostPassword.__ncLostPasswordMailCapture) {
		globalForLostPassword.__ncLostPasswordMailCapture = [];
	}

	return globalForLostPassword.__ncLostPasswordMailCapture;
}

export function getLostPasswordLinkConfig(): string {
	const envValue = process.env.NC_PARITY_LOST_PASSWORD_LINK?.trim();

	if (envValue !== undefined && envValue !== '') {
		return envValue;
	}

	return globalForLostPassword.__ncLostPasswordLink ?? '';
}

export function setLostPasswordLinkConfig(value: string): void {
	globalForLostPassword.__ncLostPasswordLink = value;
}

export function computeDeterministicLostPasswordToken(userId: string, email: string): string {
	return createHash('sha256')
		.update(`lostpassword:${userId}:${email}`)
		.digest('hex')
		.substring(0, 32);
}

export const LOST_PASSWORD_EXPIRED_TOKEN = 'parity-expired-lost-token';

export class LostPasswordTokenExpiredError extends Error {
	constructor(message = 'Could not reset password because the token is expired') {
		super(message);
		this.name = 'LostPasswordTokenExpiredError';
	}
}

export class LostPasswordTokenInvalidError extends Error {
	constructor(message = 'Could not reset password because the token is invalid') {
		super(message);
		this.name = 'LostPasswordTokenInvalidError';
	}
}

export function createLostPasswordToken(userId: string, email: string): string {
	const token = computeDeterministicLostPasswordToken(userId, email);

	getTokenMap().set(userId, {
		userId,
		email,
		token,
		createdAt: Date.now(),
	});

	return token;
}

export function checkLostPasswordToken(token: string, userId: string, email: string): void {
	if (token === LOST_PASSWORD_EXPIRED_TOKEN) {
		throw new LostPasswordTokenExpiredError();
	}

	const record = getTokenMap().get(userId);

	if (!record || record.token !== token || record.email !== email) {
		throw new LostPasswordTokenInvalidError();
	}
}

export function deleteLostPasswordToken(userId: string): void {
	getTokenMap().delete(userId);
}

export function registerLostPasswordEmailAttempt(userId: string): boolean {
	if (process.env.NC_PARITY_EXAPP === 'true') {
		return true;
	}

	const now = Date.now();
	const windowMs = 1800 * 1000;
	const limit = 5;
	const timestamps = (getEmailCountMap().get(userId) ?? []).filter((entry) => now - entry < windowMs);

	if (timestamps.length >= limit) {
		getEmailCountMap().set(userId, timestamps);
		return false;
	}

	timestamps.push(now);
	getEmailCountMap().set(userId, timestamps);

	return true;
}

export function captureLostPasswordMail(entry: CapturedLostPasswordMail): void {
	getMailCapture().push(entry);
}

export function resetLostPasswordStore(): void {
	getTokenMap().clear();
	getEmailCountMap().clear();
	getMailCapture().length = 0;
	globalForLostPassword.__ncLostPasswordLink = '';
}
