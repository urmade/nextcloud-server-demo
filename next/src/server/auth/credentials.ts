export function getConfiguredCredentials(): { username: string; password: string } {
	return {
		username: process.env.NC_ADMIN_USER?.trim() || 'admin',
		password: process.env.NC_ADMIN_PASSWORD?.trim() || 'parity-test-password',
	};
}

export function checkPassword(username: string, password: string): boolean {
	const configured = getConfiguredCredentials();

	return username === configured.username && password === configured.password;
}

export function isUserEnabled(_username: string): boolean {
	return true;
}
