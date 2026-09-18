import { USER_CONFIG_DEFAULTS, type FilesUserConfig } from './types';
import { readUserConfigValue, setStoredUserConfigValue } from './user-config-store';

const CONFIG_KEYS = Object.keys(USER_CONFIG_DEFAULTS) as Array<keyof FilesUserConfig>;

const USER_CONFIG_RULES: Record<keyof FilesUserConfig, { allowed: readonly (string | boolean)[] }> = {
	crop_image_previews: { allowed: [true, false] },
	default_view: { allowed: ['files', 'personal'] },
	folder_tree: { allowed: [true, false] },
	grid_view: { allowed: [true, false] },
	show_dialog_deletion: { allowed: [true, false] },
	show_dialog_file_extension: { allowed: [true, false] },
	show_files_extensions: { allowed: [true, false] },
	show_hidden: { allowed: [true, false] },
	show_mime_column: { allowed: [true, false] },
	sort_favorites_first: { allowed: [true, false] },
	sort_folders_first: { allowed: [true, false] },
};

export class UserConfigValidationError extends Error {}

export function getUserConfigs(userId: string): FilesUserConfig {
	return {
		crop_image_previews: readUserConfigValue(userId, 'crop_image_previews') as boolean,
		default_view: readUserConfigValue(userId, 'default_view') as FilesUserConfig['default_view'],
		folder_tree: readUserConfigValue(userId, 'folder_tree') as boolean,
		grid_view: readUserConfigValue(userId, 'grid_view') as boolean,
		show_dialog_deletion: readUserConfigValue(userId, 'show_dialog_deletion') as boolean,
		show_dialog_file_extension: readUserConfigValue(userId, 'show_dialog_file_extension') as boolean,
		show_files_extensions: readUserConfigValue(userId, 'show_files_extensions') as boolean,
		show_hidden: readUserConfigValue(userId, 'show_hidden') as boolean,
		show_mime_column: readUserConfigValue(userId, 'show_mime_column') as boolean,
		sort_favorites_first: readUserConfigValue(userId, 'sort_favorites_first') as boolean,
		sort_folders_first: readUserConfigValue(userId, 'sort_folders_first') as boolean,
	};
}

export function getUserConfigKeys(): Array<keyof FilesUserConfig> {
	return CONFIG_KEYS;
}

function isAllowedConfigValue(key: keyof FilesUserConfig, value: string): boolean {
	const allowed = USER_CONFIG_RULES[key].allowed;

	return allowed.some((candidate) => candidate == value);
}

function normalizeStoredValue(key: keyof FilesUserConfig, value: string): string {
	if (typeof USER_CONFIG_DEFAULTS[key] === 'boolean') {
		return value === '1' ? '1' : '0';
	}

	return value;
}

export function setUserConfig(
	userId: string,
	key: string,
	rawValue: unknown,
): { key: string; value: unknown } {
	if (!CONFIG_KEYS.includes(key as keyof FilesUserConfig)) {
		throw new UserConfigValidationError('Unknown config key');
	}

	const configKey = key as keyof FilesUserConfig;
	const stringValue = stringifyControllerValue(rawValue);

	if (!isAllowedConfigValue(configKey, stringValue)) {
		throw new UserConfigValidationError('Invalid config value');
	}

	setStoredUserConfigValue(userId, configKey, normalizeStoredValue(configKey, stringValue));

	return {
		key,
		value: rawValue,
	};
}

export function setShowHiddenFiles(userId: string, enabled: boolean): void {
	setStoredUserConfigValue(userId, 'show_hidden', enabled ? '1' : '0');
}

export function setCropImagePreviews(userId: string, enabled: boolean): void {
	setStoredUserConfigValue(userId, 'crop_image_previews', enabled ? '1' : '0');
}

export function stringifyControllerValue(value: unknown): string {
	if (typeof value === 'boolean') {
		return value ? '1' : '';
	}

	if (value === null || value === undefined) {
		return '';
	}

	return String(value);
}
