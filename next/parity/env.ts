import type { ParityEnv } from './types';

function requireEnv(name: string): string {
	const value = process.env[name]?.trim();

	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}

	return value.replace(/\/$/, '');
}

export function getParityEnv(): ParityEnv {
	return {
		legacyBaseUrl: requireEnv('LEGACY_BASE_URL'),
		newBaseUrl: requireEnv('NEW_BASE_URL'),
	};
}

export function hasParityEnv(): boolean {
	return Boolean(process.env.LEGACY_BASE_URL?.trim() && process.env.NEW_BASE_URL?.trim());
}
