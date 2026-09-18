import { createHash, randomBytes } from 'node:crypto';
import { generateAppPasswordToken, storeAppPasswordToken } from '@/src/server/ocs/app-password-store';

export interface LoginFlowV2Credentials {
	server: string;
	loginName: string;
	appPassword: string;
}

interface LoginFlowV2Entry {
	pollTokenHash: string;
	loginToken: string;
	clientName: string;
	started: boolean;
	server?: string;
	loginName?: string;
	appPassword?: string;
}

const TOKEN_LENGTH = 128;
const TOKEN_CHARSET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

const globalForLoginFlowV2 = globalThis as typeof globalThis & {
	__ncLoginFlowV2Entries?: Map<string, LoginFlowV2Entry>;
	__ncLoginFlowV2ByLoginToken?: Map<string, LoginFlowV2Entry>;
};

function getFlowMap(): Map<string, LoginFlowV2Entry> {
	if (!globalForLoginFlowV2.__ncLoginFlowV2Entries) {
		globalForLoginFlowV2.__ncLoginFlowV2Entries = new Map();
	}

	return globalForLoginFlowV2.__ncLoginFlowV2Entries;
}

function getLoginTokenMap(): Map<string, LoginFlowV2Entry> {
	if (!globalForLoginFlowV2.__ncLoginFlowV2ByLoginToken) {
		globalForLoginFlowV2.__ncLoginFlowV2ByLoginToken = new Map();
	}

	return globalForLoginFlowV2.__ncLoginFlowV2ByLoginToken;
}

function getSystemSecret(): string {
	return process.env.NC_SYSTEM_SECRET?.trim() || 'parity-system-secret';
}

function hashPollToken(pollToken: string): string {
	return createHash('sha512').update(`${pollToken}${getSystemSecret()}`).digest('hex');
}

function generateToken(): string {
	const bytes = randomBytes(TOKEN_LENGTH);
	let token = '';

	for (let index = 0; index < TOKEN_LENGTH; index += 1) {
		token += TOKEN_CHARSET[bytes[index] % TOKEN_CHARSET.length];
	}

	return token;
}

export interface LoginFlowV2InitResult {
	pollToken: string;
	loginToken: string;
}

export function createLoginFlowTokens(userAgent: string): LoginFlowV2InitResult {
	const pollToken = generateToken();
	const loginToken = generateToken();
	const entry: LoginFlowV2Entry = {
		pollTokenHash: hashPollToken(pollToken),
		loginToken,
		clientName: userAgent,
		started: false,
	};

	getFlowMap().set(entry.pollTokenHash, entry);
	getLoginTokenMap().set(loginToken, entry);

	return { pollToken, loginToken };
}

export function pollLoginFlow(pollToken: string): LoginFlowV2Credentials {
	const entry = getFlowMap().get(hashPollToken(pollToken));

	if (!entry || entry.loginName === undefined || entry.server === undefined || entry.appPassword === undefined) {
		throw new LoginFlowV2NotFoundError();
	}

	getFlowMap().delete(entry.pollTokenHash);
	getLoginTokenMap().delete(entry.loginToken);

	return {
		server: entry.server,
		loginName: entry.loginName,
		appPassword: entry.appPassword,
	};
}

export function getLoginFlowByLoginToken(loginToken: string): LoginFlowV2Entry {
	const entry = getLoginTokenMap().get(loginToken);

	if (!entry) {
		throw new LoginFlowV2NotFoundError();
	}

	return entry;
}

export function startLoginFlow(loginToken: string): boolean {
	const entry = getLoginTokenMap().get(loginToken);

	if (!entry) {
		return false;
	}

	entry.started = true;

	return true;
}

export function completeLoginFlow(
	loginToken: string,
	server: string,
	userId: string,
	loginName: string,
	userAgent: string,
): boolean {
	const entry = getLoginTokenMap().get(loginToken);

	if (!entry) {
		return false;
	}

	const appPassword = generateAppPasswordToken();
	storeAppPasswordToken(userId, loginName, appPassword, userAgent);

	entry.server = server;
	entry.loginName = loginName;
	entry.appPassword = appPassword;

	return true;
}

export function completeLoginFlowWithAppPassword(
	loginToken: string,
	server: string,
	loginName: string,
	appPassword: string,
): boolean {
	const entry = getLoginTokenMap().get(loginToken);

	if (!entry) {
		return false;
	}

	entry.server = server;
	entry.loginName = loginName;
	entry.appPassword = appPassword;

	return true;
}

export function seedParityLoginFlowV2Store(
	pollToken: string,
	loginToken: string,
	clientName: string,
	started = true,
): void {
	const entry: LoginFlowV2Entry = {
		pollTokenHash: hashPollToken(pollToken),
		loginToken,
		clientName,
		started,
	};

	getFlowMap().set(entry.pollTokenHash, entry);
	getLoginTokenMap().set(loginToken, entry);
}

export function resetLoginFlowV2Store(): void {
	getFlowMap().clear();
	getLoginTokenMap().clear();
}

export class LoginFlowV2NotFoundError extends Error {
	constructor(message = 'Login flow not found') {
		super(message);
		this.name = 'LoginFlowV2NotFoundError';
	}
}
