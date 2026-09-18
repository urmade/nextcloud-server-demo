export interface BeforePreferenceSetEvent {
	userId: string;
	appId: string;
	configKey: string;
	configValue: string;
	valid: boolean;
}

export interface BeforePreferenceDeletedEvent {
	userId: string;
	appId: string;
	configKey: string;
	valid: boolean;
}

export const PARITY_FIXTURE_APP_ID = 'parity_fixture';
export const PARITY_FIXTURE_CONFIG_KEY = 'valid_key';

let fixtureListenerEnabled = false;

export function setParityPreferenceFixtureListener(enabled: boolean): void {
	fixtureListenerEnabled = enabled;
}

export function resetParityPreferenceListeners(): void {
	fixtureListenerEnabled = false;
}

function dispatchFixtureSetListener(event: BeforePreferenceSetEvent): void {
	if (!fixtureListenerEnabled) {
		return;
	}

	if (event.appId === PARITY_FIXTURE_APP_ID && event.configKey === PARITY_FIXTURE_CONFIG_KEY) {
		event.valid = true;
	}
}

function dispatchFixtureDeleteListener(event: BeforePreferenceDeletedEvent): void {
	if (!fixtureListenerEnabled) {
		return;
	}

	if (event.appId === PARITY_FIXTURE_APP_ID && event.configKey === PARITY_FIXTURE_CONFIG_KEY) {
		event.valid = true;
	}
}

export function dispatchBeforePreferenceSet(
	userId: string,
	appId: string,
	configKey: string,
	configValue: string,
): BeforePreferenceSetEvent {
	const event: BeforePreferenceSetEvent = {
		userId,
		appId,
		configKey,
		configValue,
		valid: false,
	};

	dispatchFixtureSetListener(event);

	return event;
}

export function dispatchBeforePreferenceDeleted(
	userId: string,
	appId: string,
	configKey: string,
): BeforePreferenceDeletedEvent {
	const event: BeforePreferenceDeletedEvent = {
		userId,
		appId,
		configKey,
		valid: false,
	};

	dispatchFixtureDeleteListener(event);

	return event;
}
