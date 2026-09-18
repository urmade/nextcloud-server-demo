import {
	lookupAppPasswordToken,
	storeAppPasswordToken,
} from '@/src/server/ocs/app-password-store';
import { isAppPasswordWipePending, markAppPasswordForWipe } from '@/src/server/wipe/store';

export const PARITY_WIPE_PENDING_TOKEN = 'W'.repeat(72);
export const PARITY_VALID_NOT_PENDING_TOKEN = 'N'.repeat(72);

function parityWipeTokensEnabled(): boolean {
	return Boolean(process.env.NC_PARITY_USERS?.trim() || process.env.VITEST === 'true');
}

export function ensureParityWipePendingToken(): string {
	if (!parityWipeTokensEnabled()) {
		return PARITY_WIPE_PENDING_TOKEN;
	}

	if (!lookupAppPasswordToken(PARITY_WIPE_PENDING_TOKEN) || !isAppPasswordWipePending(PARITY_WIPE_PENDING_TOKEN)) {
		storeAppPasswordToken('admin', 'admin', PARITY_WIPE_PENDING_TOKEN, 'parity-wipe');
		markAppPasswordForWipe(PARITY_WIPE_PENDING_TOKEN);
	}

	return PARITY_WIPE_PENDING_TOKEN;
}

export function ensureParityValidNotPendingToken(): string {
	if (!parityWipeTokensEnabled()) {
		return PARITY_VALID_NOT_PENDING_TOKEN;
	}

	if (!lookupAppPasswordToken(PARITY_VALID_NOT_PENDING_TOKEN)) {
		storeAppPasswordToken('admin', 'admin', PARITY_VALID_NOT_PENDING_TOKEN, 'parity-wipe');
	}

	return PARITY_VALID_NOT_PENDING_TOKEN;
}

export function seedParityWipeTokensIfNeeded(): void {
	if (!parityWipeTokensEnabled()) {
		return;
	}

	ensureParityWipePendingToken();
	ensureParityValidNotPendingToken();
}
