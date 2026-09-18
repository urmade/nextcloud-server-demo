let runtimeDefaultPhoneRegion: string | null | undefined;

export function getDefaultPhoneRegion(): string {
	if (runtimeDefaultPhoneRegion !== undefined) {
		return runtimeDefaultPhoneRegion ?? '';
	}

	return process.env.NC_DEFAULT_PHONE_REGION?.trim() ?? '';
}

export function setParityDefaultPhoneRegion(region: string | null): void {
	runtimeDefaultPhoneRegion = region;
}

export function resetParityProvisioningConfig(): void {
	runtimeDefaultPhoneRegion = undefined;
}
