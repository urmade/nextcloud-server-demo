import { getAllViewConfigs } from './view-config-store';
import type { FilesViewConfigs } from './types';

export function getViewConfigs(userId: string): FilesViewConfigs {
	return getAllViewConfigs(userId);
}
