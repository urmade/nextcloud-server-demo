export interface ServerVersionComponents {
	major: number;
	minor: number;
	micro: number;
}

export interface ServerVersionPayload {
	major: number;
	minor: number;
	micro: number;
	string: string;
	edition: string;
	extendedSupport: boolean;
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
	const value = process.env[name]?.trim().toLowerCase();

	if (!value) {
		return fallback;
	}

	return value === '1' || value === 'true' || value === 'yes';
}

function readIntegerEnv(name: string, fallback: number): number {
	const value = process.env[name]?.trim();

	if (!value) {
		return fallback;
	}

	const parsed = Number.parseInt(value, 10);

	return Number.isFinite(parsed) ? parsed : fallback;
}

export function getServerVersionComponents(): ServerVersionComponents {
	return {
		major: readIntegerEnv('NC_VERSION_MAJOR', 36),
		minor: readIntegerEnv('NC_VERSION_MINOR', 0),
		micro: readIntegerEnv('NC_VERSION_MICRO', 0),
	};
}

export function getServerVersionString(): string {
	return process.env.NC_VERSION_STRING?.trim() || '36.0.0 dev';
}

export function getServerVersionDotString(): string {
	const { major, minor, micro } = getServerVersionComponents();

	return `${major}.${minor}.${micro}`;
}

export function hasExtendedSupport(): boolean {
	return readBooleanEnv('NC_EXTENDED_SUPPORT', false);
}

export function getServerVersionPayload(): ServerVersionPayload {
	const { major, minor, micro } = getServerVersionComponents();

	return {
		major,
		minor,
		micro,
		string: getServerVersionString(),
		edition: '',
		extendedSupport: hasExtendedSupport(),
	};
}
