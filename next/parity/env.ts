import type { ParityEnv } from './types';

function normalizeBaseUrl(value: string): string {
	return value.replace(/\/$/, '');
}

function optionalEnv(name: string): string | null {
	const value = process.env[name]?.trim();

	return value ? normalizeBaseUrl(value) : null;
}

function requireEnv(name: string): string {
	const value = optionalEnv(name);

	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}

	return value;
}

export function usesLegacyMock(): boolean {
	return !optionalEnv('LEGACY_BASE_URL');
}

export function getParityEnv(): ParityEnv {
	const newBaseUrl = requireEnv('NEW_BASE_URL');
	const legacyBaseUrl = optionalEnv('LEGACY_BASE_URL') ?? newBaseUrl;

	return {
		legacyBaseUrl,
		newBaseUrl,
		legacyUsesMock: usesLegacyMock(),
	};
}

export function hasParityEnv(): boolean {
	return Boolean(optionalEnv('NEW_BASE_URL'));
}
