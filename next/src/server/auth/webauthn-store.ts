export interface WebAuthnCredential {
	userId: string;
	credentialId: string;
	userVerification: boolean;
}

const globalForWebAuthn = globalThis as typeof globalThis & {
	__ncWebAuthnCredentials?: Map<string, WebAuthnCredential[]>;
};

function getCredentialMap(): Map<string, WebAuthnCredential[]> {
	if (!globalForWebAuthn.__ncWebAuthnCredentials) {
		globalForWebAuthn.__ncWebAuthnCredentials = new Map();
	}

	return globalForWebAuthn.__ncWebAuthnCredentials;
}

export function getWebAuthnCredentials(userId: string): WebAuthnCredential[] {
	return getCredentialMap().get(userId) ?? [];
}

export function registerFixtureWebAuthnCredential(
	userId: string,
	credentialId: string,
	userVerification = true,
): WebAuthnCredential {
	const credential: WebAuthnCredential = {
		userId,
		credentialId,
		userVerification,
	};
	const existing = getCredentialMap().get(userId) ?? [];

	if (!existing.some((entry) => entry.credentialId === credentialId)) {
		existing.push(credential);
		getCredentialMap().set(userId, existing);
	}

	return credential;
}

export function hasWebAuthnCredentials(userId: string): boolean {
	return getWebAuthnCredentials(userId).length > 0;
}

export function resetWebAuthnStore(): void {
	getCredentialMap().clear();
}
