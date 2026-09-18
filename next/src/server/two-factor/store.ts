import { findParityTwoFactorProvider } from '@/src/server/two-factor/catalog';
import type { TwoFactorProviderStates } from '@/src/server/two-factor/types';

const globalForTwoFactor = globalThis as typeof globalThis & {
	__ncTwoFactorStates?: Map<string, TwoFactorProviderStates>;
};

function getStateMap(): Map<string, TwoFactorProviderStates> {
	if (!globalForTwoFactor.__ncTwoFactorStates) {
		globalForTwoFactor.__ncTwoFactorStates = new Map();
	}

	return globalForTwoFactor.__ncTwoFactorStates;
}

function cloneStates(states: TwoFactorProviderStates): TwoFactorProviderStates {
	return { ...states };
}

export function getTwoFactorProviderStates(userId: string): TwoFactorProviderStates {
	const states = getStateMap().get(userId);

	return states ? cloneStates(states) : {};
}

export function tryEnableTwoFactorProvider(providerId: string, userId: string): boolean {
	const provider = findParityTwoFactorProvider(providerId);

	if (!provider?.enableByAdmin) {
		return false;
	}

	const map = getStateMap();
	const current = map.get(userId) ?? {};
	current[providerId] = true;
	map.set(userId, current);

	return true;
}

export function tryDisableTwoFactorProvider(providerId: string, userId: string): boolean {
	const provider = findParityTwoFactorProvider(providerId);

	if (!provider?.disableByAdmin) {
		return false;
	}

	const map = getStateMap();
	const current = map.get(userId) ?? {};
	current[providerId] = false;
	map.set(userId, current);

	return true;
}

export function resetTwoFactorStore(): void {
	getStateMap().clear();
}
