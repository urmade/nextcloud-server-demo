import { setParityPreferenceFixtureListener } from '@/src/server/provisioning/preference-events';

let runtimeDefaultPhoneRegion: string | null | undefined;
let runtimePreferenceFixtureListener: boolean | undefined;

export function getDefaultPhoneRegion(): string {
	if (runtimeDefaultPhoneRegion !== undefined) {
		return runtimeDefaultPhoneRegion ?? '';
	}

	return process.env.NC_DEFAULT_PHONE_REGION?.trim() ?? '';
}

export function setParityDefaultPhoneRegion(region: string | null): void {
	runtimeDefaultPhoneRegion = region;
}

export function setParityPreferenceFixtureListenerEnabled(enabled: boolean): void {
	runtimePreferenceFixtureListener = enabled;
	setParityPreferenceFixtureListener(enabled);
}

export function resetParityProvisioningConfig(): void {
	runtimeDefaultPhoneRegion = undefined;
	runtimePreferenceFixtureListener = undefined;
}
