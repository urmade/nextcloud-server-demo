export interface FilesUserConfig {
	crop_image_previews: boolean;
	default_view: 'files' | 'personal';
	folder_tree: boolean;
	grid_view: boolean;
	show_dialog_deletion: boolean;
	show_dialog_file_extension: boolean;
	show_files_extensions: boolean;
	show_hidden: boolean;
	show_mime_column: boolean;
	sort_favorites_first: boolean;
	sort_folders_first: boolean;
}

export interface FilesViewConfigEntry {
	sorting_mode: string | null;
	sorting_direction: 'asc' | 'desc';
	expanded: boolean;
}

export type FilesViewConfigs = Record<string, FilesViewConfigEntry>;

export interface FilesStorageStats {
	free: number;
	used: number;
	quota: number;
	total: number;
	relative: number;
	owner: string | false;
	ownerDisplayName: string;
	mountType: string;
	mountPoint: string;
}

export const FILES_APP_ID = 'files';

export const USER_CONFIG_DEFAULTS: FilesUserConfig = {
	crop_image_previews: true,
	default_view: 'files',
	folder_tree: true,
	grid_view: false,
	show_dialog_deletion: false,
	show_dialog_file_extension: true,
	show_files_extensions: true,
	show_hidden: false,
	show_mime_column: false,
	sort_favorites_first: true,
	sort_folders_first: true,
};

export const VIEW_CONFIG_DEFAULTS: FilesViewConfigEntry = {
	sorting_mode: null,
	sorting_direction: 'asc',
	expanded: true,
};
