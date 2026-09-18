import {
	FILES_APP_ID,
	USER_CONFIG_DEFAULTS,
	type FilesUserConfig,
} from './types';

const userConfigs = new Map<string, Partial<Record<keyof FilesUserConfig, string>>>();
const legacyPrefs = new Map<string, Record<string, string>>();

export function getStoredUserConfigValue(
	userId: string,
	key: keyof FilesUserConfig,
): string | undefined {
	return userConfigs.get(userId)?.[key];
}

export function setStoredUserConfigValue(
	userId: string,
	key: keyof FilesUserConfig,
	value: string,
): void {
	const current = userConfigs.get(userId) ?? {};
	current[key] = value;
	userConfigs.set(userId, current);
}

export function getLegacyPref(userId: string, key: string, defaultValue = '0'): string {
	return legacyPrefs.get(userId)?.[key] ?? defaultValue;
}

export function setLegacyPref(userId: string, key: string, value: string): void {
	const current = legacyPrefs.get(userId) ?? {};
	current[key] = value;
	legacyPrefs.set(userId, current);
}

export function readUserConfigValue(
	userId: string,
	key: keyof FilesUserConfig,
): FilesUserConfig[keyof FilesUserConfig] {
	const stored = getStoredUserConfigValue(userId, key);
	const defaultValue = USER_CONFIG_DEFAULTS[key];

	if (stored === undefined) {
		return defaultValue;
	}

	if (typeof defaultValue === 'boolean') {
		return stored === '1';
	}

	return stored as FilesUserConfig[keyof FilesUserConfig];
}

export function resetFilesUserConfigStore(): void {
	userConfigs.clear();
	legacyPrefs.clear();
}

export function getUserConfigAppId(): string {
	return FILES_APP_ID;
}
