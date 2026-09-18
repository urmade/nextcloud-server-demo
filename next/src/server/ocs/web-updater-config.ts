/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

function readBooleanEnv(name: string, fallback = false): boolean {
	const value = process.env[name]?.trim().toLowerCase();

	if (!value) {
		return fallback;
	}

	return value === '1' || value === 'true' || value === 'yes';
}

let runtimeNeedsUpgrade: boolean | undefined;
let runtimeDisableWeb: boolean | undefined;

export function parityNeedsUpgrade(): boolean {
	if (runtimeNeedsUpgrade !== undefined) {
		return runtimeNeedsUpgrade;
	}

	return readBooleanEnv('NC_NEEDS_DB_UPGRADE', false);
}

export function parityUpgradeDisableWeb(): boolean {
	if (runtimeDisableWeb !== undefined) {
		return runtimeDisableWeb;
	}

	return readBooleanEnv('NC_PARITY_UPGRADE_DISABLE_WEB', false);
}

export function setParityWebUpdaterRuntimeConfig(config: {
	needsUpgrade?: boolean;
	disableWeb?: boolean;
}): void {
	if (typeof config.needsUpgrade === 'boolean') {
		runtimeNeedsUpgrade = config.needsUpgrade;
	}

	if (typeof config.disableWeb === 'boolean') {
		runtimeDisableWeb = config.disableWeb;
	}
}

export function resetParityWebUpdaterRuntimeConfig(): void {
	runtimeNeedsUpgrade = undefined;
	runtimeDisableWeb = undefined;
}
