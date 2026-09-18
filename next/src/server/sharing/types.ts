export const NODE_SHARE_SOURCE_TYPE = 'OCA\\Files\\Sharing\\Source\\NodeShareSourceType';
export const USER_SHARE_RECIPIENT_TYPE = 'OC\\Core\\Sharing\\Recipient\\UserShareRecipientType';
export const TOKEN_SHARE_RECIPIENT_TYPE = 'OC\\Core\\Sharing\\Recipient\\TokenShareRecipientType';
export const RESHARE_SHARE_PERMISSION_TYPE = 'OC\\Core\\Sharing\\Permission\\ReshareSharePermissionType';

export interface SharingSourceRecord {
	class: string;
	value: string;
}

export interface SharingRecipientPermissionRecord {
	class: string;
	enabled: boolean;
}

export interface SharingRecipientRecord {
	class: string;
	value: string;
	instance: string | null;
	secret: string | null;
	permissions: SharingRecipientPermissionRecord[];
}

export interface SharingPropertyRecord {
	class: string;
	value: string | null;
}

export interface SharingSharePermissionRecord {
	class: string;
	enabled: boolean;
}
