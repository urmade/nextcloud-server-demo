import {
	getServerVersionDotString,
	getServerVersionString,
	hasExtendedSupport,
} from '@/src/server/version';

export interface StatusPayload {
	installed: boolean;
	maintenance: boolean;
	needsDbUpgrade: boolean;
	version: string;
	versionstring: string;
	edition: string;
	productname: string;
	extendedSupport: boolean;
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
	const value = process.env[name]?.trim().toLowerCase();

	if (!value) {
		return fallback;
	}

	return value === '1' || value === 'true' || value === 'yes';
}

export function getProductName(): string {
	return process.env.NC_PRODUCT_NAME?.trim() || 'Nextcloud';
}

export function getStatusPayload(): StatusPayload {
	return {
		installed: readBooleanEnv('NC_INSTALLED', true),
		maintenance: readBooleanEnv('NC_MAINTENANCE', false),
		needsDbUpgrade: readBooleanEnv('NC_NEEDS_DB_UPGRADE', false),
		version: getServerVersionDotString(),
		versionstring: getServerVersionString(),
		edition: '',
		productname: getProductName(),
		extendedSupport: hasExtendedSupport(),
	};
}
