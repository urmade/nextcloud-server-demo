export interface ConversionMimeMapping {
	from: string;
	to: string;
	extension: string;
}

const PARITY_CONVERSION_PROVIDER: ConversionMimeMapping[] = [
	{
		from: 'image/jpeg',
		to: 'image/png',
		extension: 'png',
	},
];

let providerEnabled = true;

export function isConversionProviderEnabled(): boolean {
	return providerEnabled;
}

export function setConversionProviderEnabled(enabled: boolean): void {
	providerEnabled = enabled;
}

export function findConversionMapping(sourceMime: string, targetMime: string): ConversionMimeMapping | null {
	if (!providerEnabled) {
		return null;
	}

	return PARITY_CONVERSION_PROVIDER.find((mapping) => (
		mapping.from === sourceMime && mapping.to === targetMime
	)) ?? null;
}

export function resetConversionStore(): void {
	providerEnabled = true;
}
