export const PARITY_TEXT_TO_IMAGE_APP_ID = 'core';

export function isTextToImageProviderAvailable(): boolean {
	const value = process.env.NC_PARITY_TEXT_TO_IMAGE_PROVIDER?.trim().toLowerCase();

	return value !== 'false' && value !== '0';
}
