import { getServerVersionPayload } from '@/src/server/version';

export const URL_REGEX_NO_MODIFIERS =
	'(\\s|\\n|^)(https?:\\/\\/)([-A-Z0-9+_.]+(?::[0-9]+)?(?:\\/[-A-Z0-9+&@#%?=~_|!:,.;()]*)*)(\\s|\\n|$)';

export interface CoreUserCapabilities {
	language: string;
	locale: string;
	timezone: string;
}

export interface CoreCapabilities {
	pollinterval: number;
	'webdav-root': string;
	'reference-api': boolean;
	'reference-regex': string;
	'mod-rewrite-working': boolean;
	user?: CoreUserCapabilities;
	'can-create-app-token'?: boolean;
}

export interface CapabilitiesDocument {
	version: ReturnType<typeof getServerVersionPayload>;
	capabilities: {
		core: CoreCapabilities;
	};
}

function readIntegerEnv(name: string, fallback: number): number {
	const value = process.env[name]?.trim();

	if (!value) {
		return fallback;
	}

	const parsed = Number.parseInt(value, 10);

	return Number.isFinite(parsed) ? parsed : fallback;
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
	const value = process.env[name]?.trim().toLowerCase();

	if (!value) {
		return fallback;
	}

	return value === '1' || value === 'true' || value === 'yes';
}

export function getPublicCoreCapabilities(): CoreCapabilities {
	return {
		pollinterval: readIntegerEnv('NC_POLL_INTERVAL', 60),
		'webdav-root': process.env.NC_WEBDAV_ROOT?.trim() || 'remote.php/webdav',
		'reference-api': true,
		'reference-regex': URL_REGEX_NO_MODIFIERS,
		'mod-rewrite-working': readBooleanEnv('NC_MOD_REWRITE_WORKING', true),
	};
}

export function getAuthenticatedCoreCapabilities(): CoreCapabilities {
	return {
		...getPublicCoreCapabilities(),
		user: {
			language: process.env.NC_USER_LANGUAGE?.trim() || 'en',
			locale: process.env.NC_USER_LOCALE?.trim() || 'en',
			timezone: process.env.NC_USER_TIMEZONE?.trim() || 'UTC',
		},
		'can-create-app-token': readBooleanEnv('NC_CAN_CREATE_APP_TOKEN', true),
	};
}

export function getCapabilitiesDocument(authenticated: boolean): CapabilitiesDocument {
	return {
		version: getServerVersionPayload(),
		capabilities: {
			core: authenticated ? getAuthenticatedCoreCapabilities() : getPublicCoreCapabilities(),
		},
	};
}
