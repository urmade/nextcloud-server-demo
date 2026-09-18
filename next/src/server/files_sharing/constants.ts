export const SHARE_TYPE_USER = 0;
export const SHARE_TYPE_GROUP = 1;
export const SHARE_TYPE_LINK = 3;
export const SHARE_TYPE_EMAIL = 4;

export const SHARE_STATUS_PENDING = 0;
export const SHARE_STATUS_ACCEPTED = 1;
export const SHARE_STATUS_REJECTED = 2;

export const PERMISSION_READ = 1;
export const PERMISSION_UPDATE = 2;
export const PERMISSION_CREATE = 4;
export const PERMISSION_DELETE = 8;
export const PERMISSION_SHARE = 16;
export const PERMISSION_ALL = 31;

export const DEFAULT_SHARE_PERMISSIONS = PERMISSION_ALL;
export const MAX_AUTOCOMPLETE_RESULTS = 25;
export const TOKEN_MAX_LENGTH = 32;
