import {
	setParityDefaultPhoneRegion as setLocalDefaultPhoneRegion,
	setParityPreferenceFixtureListenerEnabled,
} from '@/src/server/provisioning/config';
import {
	createMailVerificationToken,
	encryptMailVerificationKey,
	removeEmailFromUser,
} from '@/src/server/provisioning/mail-verify';
import { resetProvisioningStore } from '@/src/server/provisioning/store';
import { getParityEnv } from '../env';

export async function resetParityProvisioningStores(): Promise<void> {
	resetProvisioningStore();

	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/api/parity/reset-provisioning-store`, {
		method: 'POST',
	});

	if (!response.ok) {
		throw new Error(`Failed to reset Next.js provisioning store (${response.status})`);
	}
}

export async function setParityDefaultPhoneRegion(region: string | null): Promise<void> {
	setLocalDefaultPhoneRegion(region);

	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/api/parity/set-provisioning-config`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
		},
		body: JSON.stringify({ defaultPhoneRegion: region }),
	});

	if (!response.ok) {
		throw new Error(`Failed to set Next.js provisioning config (${response.status})`);
	}
}

export async function seedParityMailVerification(
	userId: string,
	email: string,
): Promise<{ token: string; key: string }> {
	const token = createMailVerificationToken(userId, email);
	const key = encryptMailVerificationKey(email);

	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/api/parity/seed-mail-verify`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
		},
		body: JSON.stringify({ userId, email }),
	});

	if (!response.ok) {
		throw new Error(`Failed to seed mail verification on the Next.js server (${response.status})`);
	}

	const body = await response.json() as { token: string; key: string };

	return {
		token: body.token || token,
		key: body.key || key,
	};
}

export async function removeParityProvisioningEmail(userId: string, email: string): Promise<void> {
	removeEmailFromUser(userId, email);

	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/api/parity/remove-provisioning-email`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
		},
		body: JSON.stringify({ userId, email }),
	});

	if (!response.ok) {
		throw new Error(`Failed to remove provisioning email on the Next.js server (${response.status})`);
	}
}

export async function setParityPreferenceFixtureListener(enabled: boolean): Promise<void> {
	setParityPreferenceFixtureListenerEnabled(enabled);

	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/api/parity/set-provisioning-config`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
		},
		body: JSON.stringify({ preferenceFixtureListener: enabled }),
	});

	if (!response.ok) {
		throw new Error(`Failed to set Next.js preference fixture listener (${response.status})`);
	}
}
