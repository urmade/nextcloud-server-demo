import { stringifyControllerValue } from './user-config';
import {
	getAllViewConfigs,
	getViewConfigForView,
	setStoredViewConfig,
} from './view-config-store';
import { VIEW_CONFIG_DEFAULTS, type FilesViewConfigEntry, type FilesViewConfigs } from './types';

const VIEW_CONFIG_KEYS = ['sorting_mode', 'sorting_direction', 'expanded'] as const;
type ViewConfigKey = typeof VIEW_CONFIG_KEYS[number];

const VIEW_CONFIG_RULES: Record<ViewConfigKey, { allowed: readonly (string | boolean | null)[] }> = {
	sorting_mode: { allowed: [] },
	sorting_direction: { allowed: ['asc', 'desc'] },
	expanded: { allowed: [true, false] },
};

export class ViewConfigValidationError extends Error {}

export function getViewConfigs(userId: string): FilesViewConfigs {
	return getAllViewConfigs(userId);
}

function isAllowedViewConfigValue(key: ViewConfigKey, value: string): boolean {
	const allowed = VIEW_CONFIG_RULES[key].allowed;

	if (allowed.length === 0) {
		return true;
	}

	return allowed.some((candidate) => candidate == value);
}

function normalizeViewConfigValue(key: ViewConfigKey, value: string): FilesViewConfigEntry[ViewConfigKey] {
	if (typeof VIEW_CONFIG_DEFAULTS[key] === 'boolean') {
		return value === '1';
	}

	if (key === 'sorting_mode') {
		return value === '' ? null : value;
	}

	return value as FilesViewConfigEntry[ViewConfigKey];
}

export function setViewConfig(
	userId: string,
	view: string,
	key: string,
	rawValue: unknown,
): FilesViewConfigEntry {
	if (!view) {
		throw new Error('Unknown view');
	}

	if (!VIEW_CONFIG_KEYS.includes(key as ViewConfigKey)) {
		throw new ViewConfigValidationError('Unknown config key');
	}

	const configKey = key as ViewConfigKey;
	const stringValue = stringifyControllerValue(rawValue);

	if (!isAllowedViewConfigValue(configKey, stringValue)) {
		throw new ViewConfigValidationError('Invalid config value');
	}

	setStoredViewConfig(userId, view, configKey, normalizeViewConfigValue(configKey, stringValue));

	return getViewConfigForView(userId, view);
}
