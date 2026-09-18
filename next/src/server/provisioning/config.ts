import { setParityPreferenceFixtureListener } from '@/src/server/provisioning/preference-events';

let runtimeDefaultPhoneRegion: string | null | undefined;
let runtimePreferenceFixtureListener: boolean | undefined;
let runtimeGenerateUserId: boolean | undefined;
let runtimeRequireEmail: boolean | undefined;
let runtimeWelcomeMailSendFails: boolean | undefined;

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

export function getGenerateUserIdEnabled(): boolean {
	if (runtimeGenerateUserId !== undefined) {
		return runtimeGenerateUserId;
	}

	return process.env.NC_NEW_USER_GENERATE_USER_ID?.trim() === 'yes';
}

export function getRequireEmailEnabled(): boolean {
	if (runtimeRequireEmail !== undefined) {
		return runtimeRequireEmail;
	}

	return process.env.NC_NEW_USER_REQUIRE_EMAIL?.trim() === 'yes';
}

export function getWelcomeMailSendFails(): boolean {
	return runtimeWelcomeMailSendFails === true;
}

export function setParityGenerateUserId(enabled: boolean): void {
	runtimeGenerateUserId = enabled;
}

export function setParityRequireEmail(enabled: boolean): void {
	runtimeRequireEmail = enabled;
}

export function setParityWelcomeMailSendFails(fails: boolean): void {
	runtimeWelcomeMailSendFails = fails;
}

export function resetParityProvisioningConfig(): void {
	runtimeDefaultPhoneRegion = undefined;
	runtimePreferenceFixtureListener = undefined;
	runtimeGenerateUserId = undefined;
	runtimeRequireEmail = undefined;
	runtimeWelcomeMailSendFails = undefined;
}
