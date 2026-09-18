import {
	VIEW_CONFIG_DEFAULTS,
	type FilesViewConfigEntry,
	type FilesViewConfigs,
} from './types';

const viewConfigs = new Map<string, Record<string, Partial<FilesViewConfigEntry>>>();

export function getStoredViewConfigs(userId: string): Record<string, Partial<FilesViewConfigEntry>> {
	return viewConfigs.get(userId) ?? {};
}

export function setStoredViewConfig(
	userId: string,
	view: string,
	key: keyof FilesViewConfigEntry,
	value: FilesViewConfigEntry[keyof FilesViewConfigEntry],
): void {
	const current = viewConfigs.get(userId) ?? {};
	const viewEntry: Partial<FilesViewConfigEntry> = { ...(current[view] ?? {}) };

	if (key === 'sorting_mode') {
		viewEntry.sorting_mode = value as string | null;
	} else if (key === 'sorting_direction') {
		viewEntry.sorting_direction = value as FilesViewConfigEntry['sorting_direction'];
	} else {
		viewEntry.expanded = value as boolean;
	}

	current[view] = viewEntry;
	viewConfigs.set(userId, current);
}

export function getViewConfigForView(userId: string, view: string): FilesViewConfigEntry {
	const stored = getStoredViewConfigs(userId)[view] ?? {};

	return {
		sorting_mode: stored.sorting_mode ?? VIEW_CONFIG_DEFAULTS.sorting_mode,
		sorting_direction: stored.sorting_direction ?? VIEW_CONFIG_DEFAULTS.sorting_direction,
		expanded: stored.expanded ?? VIEW_CONFIG_DEFAULTS.expanded,
	};
}

export function getAllViewConfigs(userId: string): FilesViewConfigs {
	const stored = getStoredViewConfigs(userId);
	const views = Object.keys(stored);
	const result: FilesViewConfigs = {};

	for (const view of views) {
		result[view] = getViewConfigForView(userId, view);
	}

	return result;
}

export function resetFilesViewConfigStore(): void {
	viewConfigs.clear();
}
