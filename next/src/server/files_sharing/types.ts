export interface ShareRecord {
	id: number;
	shareType: number;
	sharedBy: string;
	shareOwner: string;
	sharedWith: string | null;
	permissions: number;
	nodeId: number;
	path: string;
	target: string;
	token: string | null;
	password: string | null;
	note: string;
	label: string;
	status: number;
	shareTime: number;
	expiration: string | null;
	hideDownload: boolean;
	mailSend: boolean;
	sendPasswordByTalk: boolean;
	deletedFromSelf: string[];
}

export interface ShareCreateBody {
	path?: string;
	permissions?: number;
	shareType?: number;
	shareWith?: string;
	publicUpload?: string;
	password?: string;
	sendPasswordByTalk?: string;
	expireDate?: string;
	note?: string;
	label?: string;
	attributes?: string;
	sendMail?: string;
}

export interface ShareUpdateBody {
	permissions?: number;
	password?: string;
	sendPasswordByTalk?: string;
	publicUpload?: string;
	expireDate?: string;
	note?: string;
	label?: string;
	hideDownload?: string;
	attributes?: string;
	sendMail?: string;
	token?: string;
}

export interface FormattedShare {
	id: number;
	share_type: number;
	uid_owner: string;
	displayname_owner: string;
	permissions: number;
	can_edit: boolean;
	can_delete: boolean;
	stime: number;
	parent: null;
	expiration: string | null;
	token: string | null;
	uid_file_owner: string;
	note: string;
	label: string;
	displayname_file_owner: string;
	path: string;
	item_type: 'file' | 'folder';
	item_permissions?: number;
	'is-mount-root': boolean;
	'mount-type': string;
	mimetype: string;
	has_preview: boolean;
	storage_id: string;
	storage: number;
	item_source: number;
	file_source: number;
	file_parent: number;
	file_target: string;
	item_size: number;
	item_mtime: number;
	share_with?: string;
	share_with_displayname?: string;
	share_with_displayname_unique?: string;
	password?: string | boolean;
	send_password_by_talk?: boolean;
	url?: string;
	via_fileid?: number;
	via_path?: string;
}

export interface ShareesSearchResult {
	exact: {
		users: unknown[];
		groups: unknown[];
		remotes: unknown[];
		remote_groups: unknown[];
		emails: unknown[];
		circles: unknown[];
		rooms: unknown[];
	};
	users: unknown[];
	groups: unknown[];
	remotes: unknown[];
	remote_groups: unknown[];
	emails: unknown[];
	lookup: unknown[];
	circles: unknown[];
	rooms: unknown[];
	lookupEnabled: boolean;
}
