const globalForPreferences = globalThis as typeof globalThis & {
	__ncUserPreferences?: Map<string, Map<string, Map<string, string>>>;
};

function getPreferencesMap(): Map<string, Map<string, Map<string, string>>> {
	if (!globalForPreferences.__ncUserPreferences) {
		globalForPreferences.__ncUserPreferences = new Map();
	}

	return globalForPreferences.__ncUserPreferences;
}

function getAppMap(userId: string): Map<string, Map<string, string>> {
	const preferences = getPreferencesMap();
	let appMap = preferences.get(userId);

	if (!appMap) {
		appMap = new Map();
		preferences.set(userId, appMap);
	}

	return appMap;
}

export function getUserPreference(userId: string, appId: string, configKey: string): string | null {
	return getAppMap(userId).get(appId)?.get(configKey) ?? null;
}

export function setUserPreference(userId: string, appId: string, configKey: string, configValue: string): void {
	const appMap = getAppMap(userId);
	let keyMap = appMap.get(appId);

	if (!keyMap) {
		keyMap = new Map();
		appMap.set(appId, keyMap);
	}

	keyMap.set(configKey, configValue);
}

export function deleteUserPreference(userId: string, appId: string, configKey: string): void {
	const keyMap = getAppMap(userId).get(appId);

	if (!keyMap) {
		return;
	}

	keyMap.delete(configKey);

	if (keyMap.size === 0) {
		getAppMap(userId).delete(appId);
	}
}

export function resetUserPreferencesStore(): void {
	globalForPreferences.__ncUserPreferences = new Map();
}
