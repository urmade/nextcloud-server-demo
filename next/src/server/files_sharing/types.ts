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

export interface FormattedDeletedShare {
	id: string;
	share_type: number;
	uid_owner: string;
	displayname_owner: string;
	permissions: number;
	stime: number;
	parent: null;
	expiration: string | null;
	token: null;
	uid_file_owner: string;
	displayname_file_owner: string;
	path: string;
	item_type: 'file' | 'folder';
	mimetype: string;
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
}

export interface ExternalShareRecord {
	id: string;
	parent: string;
	shareType: number;
	remote: string;
	remoteId: string;
	refreshToken: string;
	password: string | null;
	accessToken: string | null;
	accessTokenExpires: number | null;
	name: string;
	owner: string;
	user: string;
	mountpoint: string;
	accepted: number;
}

export interface FormattedExternalShare {
	id: string;
	parent: string;
	share_type: number;
	remote: string;
	remote_id: string;
	refresh_token: string;
	name: string;
	owner: string;
	user: string;
	mountpoint: string;
	accepted: number;
	file_id: null;
	mimetype: null;
	permissions: null;
	mtime: null;
	type: null;
	item_size: null;
}

export interface FormattedRemoteShare {
	id: string;
	parent: string | null;
	share_type: number;
	remote: string;
	remote_id: string;
	refresh_token: string;
	name: string;
	owner: string;
	user: string;
	mountpoint: string;
	accepted: number;
	file_id: number | null;
	mimetype: string | null;
	permissions: number | null;
	mtime: number | null;
	type: string | null;
	item_size: number | null;
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
