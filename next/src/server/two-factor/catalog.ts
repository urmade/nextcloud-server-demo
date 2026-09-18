export interface ParityTwoFactorProvider {
	id: string;
	enableByAdmin: boolean;
	disableByAdmin: boolean;
}

const DEFAULT_PROVIDERS: ParityTwoFactorProvider[] = [
	{
		id: 'parity-totp',
		enableByAdmin: true,
		disableByAdmin: true,
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
