export interface ParityTwoFactorProvider {
	id: string;
	enableByAdmin: boolean;
	disableByAdmin: boolean;
	activatableAtLogin?: boolean;
}

const DEFAULT_PROVIDERS: ParityTwoFactorProvider[] = [
	{
		id: 'parity-totp',
		enableByAdmin: true,
		disableByAdmin: true,
	},
	{
		id: 'parity-setup',
		enableByAdmin: false,
		disableByAdmin: false,
		activatableAtLogin: true,
	},
];

export function isTwoFactorProviderCatalogAvailable(): boolean {
	const raw = process.env.NC_PARITY_TWO_FACTOR_PROVIDER?.trim();

	if (!raw) {
		return true;
	}

	return raw !== 'false' && raw !== '0';
}

export function getParityTwoFactorProviders(): ParityTwoFactorProvider[] {
	if (!isTwoFactorProviderCatalogAvailable()) {
		return [];
	}

	return DEFAULT_PROVIDERS;
}

export function findParityTwoFactorProvider(providerId: string): ParityTwoFactorProvider | undefined {
	return getParityTwoFactorProviders().find((provider) => provider.id === providerId);
}

export function getLoginSetupProviderIds(): string[] {
	return getParityTwoFactorProviders()
		.filter((provider) => provider.activatableAtLogin === true)
		.map((provider) => provider.id);
}
