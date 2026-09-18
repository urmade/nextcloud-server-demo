export interface ParityEnv {
	legacyBaseUrl: string;
	newBaseUrl: string;
}

export interface ParityWaived {
	reason: string;
	owner: string;
}

export interface ParityRequestOptions {
	method?: string;
	headers?: Record<string, string>;
	body?: string;
}

export interface ParityResponseSnapshot {
	status: number;
	headers: Record<string, string>;
	body: unknown;
	rawBody: string;
}

export interface ParityCompareOptions {
	contractHeaders?: string[];
	ignoreHeaders?: string[];
	timestampToleranceMs?: number;
	timestampPaths?: string[];
	unstableIdPaths?: string[];
	unorderedListPaths?: string[];
	fixtures?: Record<string, unknown>;
}

export interface ParityMismatch {
	path: string;
	legacy: unknown;
	new: unknown;
	message: string;
}
