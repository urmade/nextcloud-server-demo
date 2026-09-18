export interface ParityUser {
	userId: string;
	email: string;
	displayName: string;
	enabled: boolean;
}

const globalForCredentials = globalThis as typeof globalThis & {
	__ncPasswordOverrides?: Map<string, string>;
};

function getPasswordOverrides(): Map<string, string> {
	if (!globalForCredentials.__ncPasswordOverrides) {
		globalForCredentials.__ncPasswordOverrides = new Map();
	}

	return globalForCredentials.__ncPasswordOverrides;
}

export function getConfiguredCredentials(): { username: string; password: string } {
	return {
		username: process.env.NC_ADMIN_USER?.trim() || 'admin',
		password: process.env.NC_ADMIN_PASSWORD?.trim() || 'parity-test-password',
	};
}

export function getParityUserEmail(userId: string): string | null {
	const configured = getConfiguredCredentials();

	if (userId === configured.username) {
		return 'admin@parity.test';
	}

	return null;
}

export function findUserByIdOrMail(input: string): ParityUser | null {
	const trimmed = input.trim();
	const configured = getConfiguredCredentials();

	if (trimmed === configured.username) {
		return {
			userId: configured.username,
			email: 'admin@parity.test',
			displayName: 'Admin',
			enabled: true,
		};
	}

	if (trimmed === 'admin@parity.test') {
		return {
			userId: configured.username,
			email: 'admin@parity.test',
			displayName: 'Admin',
			enabled: true,
		};
	}

	return null;
}

export function getUserById(userId: string): ParityUser | null {
	return findUserByIdOrMail(userId);
}

export function checkPassword(username: string, password: string): boolean {
	const override = getPasswordOverrides().get(username);

	if (override !== undefined) {
		return password === override;
	}

	const configured = getConfiguredCredentials();

	return username === configured.username && password === configured.password;
}

export function setUserPassword(userId: string, password: string): boolean {
	if (!getUserById(userId)) {
		return false;
	}

	getPasswordOverrides().set(userId, password);

	return true;
}

export function isUserEnabled(_username: string): boolean {
	return true;
}

export function resetCredentialOverrides(): void {
	getPasswordOverrides().clear();
}
