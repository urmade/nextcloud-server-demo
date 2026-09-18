import {
	invalidateAppPasswordToken,
	lookupAppPasswordToken,
} from '@/src/server/ocs/app-password-store';

const globalForWipe = globalThis as typeof globalThis & {
	__ncWipePendingTokens?: Set<string>;
};

function getWipePendingTokens(): Set<string> {
	if (!globalForWipe.__ncWipePendingTokens) {
		globalForWipe.__ncWipePendingTokens = new Set();
	}

	return globalForWipe.__ncWipePendingTokens;
}

export function markAppPasswordForWipe(token: string): boolean {
	if (!lookupAppPasswordToken(token)) {
		return false;
	}

	getWipePendingTokens().add(token);

	return true;
}

export function isAppPasswordWipePending(token: string): boolean {
	return getWipePendingTokens().has(token) && lookupAppPasswordToken(token) !== null;
}

export type RemoteWipeResult = 'invalid' | 'not-pending' | 'ok';

export function startRemoteWipe(token: string): RemoteWipeResult {
	if (!lookupAppPasswordToken(token)) {
		return 'invalid';
	}

	if (!getWipePendingTokens().has(token)) {
		return 'not-pending';
	}

	return 'ok';
}

export function finishRemoteWipe(token: string): RemoteWipeResult {
	if (!lookupAppPasswordToken(token)) {
		return 'invalid';
	}

	if (!getWipePendingTokens().has(token)) {
		return 'not-pending';
	}

	getWipePendingTokens().delete(token);
	invalidateAppPasswordToken(token);

	return 'ok';
}

export function resetWipeStore(): void {
	getWipePendingTokens().clear();
}
