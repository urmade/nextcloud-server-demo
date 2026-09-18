import { USER_CONFIG_DEFAULTS, type FilesUserConfig } from './types';
import { readUserConfigValue } from './user-config-store';

const CONFIG_KEYS = Object.keys(USER_CONFIG_DEFAULTS) as Array<keyof FilesUserConfig>;

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
