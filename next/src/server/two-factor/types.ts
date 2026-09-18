export interface TwoFactorEnableRequest {
	user: string;
	providers?: string[];
}

export interface TwoFactorDisableRequest {
	user: string;
	providers?: string[];
}

export type TwoFactorProviderStates = Record<string, boolean>;
