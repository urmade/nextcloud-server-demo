import { getLegacyPref, setLegacyPref } from './user-config-store';

const SHOW_GRID_KEY = 'show_grid';

export function getGridViewEnabled(userId: string): boolean {
	return getLegacyPref(userId, SHOW_GRID_KEY, '0') === '1';
}

export function setGridViewEnabled(userId: string, enabled: boolean): void {
	setLegacyPref(userId, SHOW_GRID_KEY, enabled ? '1' : '0');
}
