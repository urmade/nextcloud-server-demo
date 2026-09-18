export interface BasicAuthCredentials {
	username: string;
	password: string;
}

export function parseBasicAuthHeader(authorizationHeader: string | null): BasicAuthCredentials | null {
	if (!authorizationHeader) {
		return null;
	}

	const match = /^Basic\s+(.+)$/i.exec(authorizationHeader.trim());

	if (!match) {
		return null;
	}

	try {
		const decoded = Buffer.from(match[1], 'base64').toString('utf8');
		const separatorIndex = decoded.indexOf(':');

		if (separatorIndex < 0) {
			return null;
		}

		return {
			username: decoded.slice(0, separatorIndex),
			password: decoded.slice(separatorIndex + 1),
		};
	} catch {
		return null;
	}
}

export function isValidBasicAuth(credentials: BasicAuthCredentials | null): boolean {
	if (!credentials) {
		return false;
	}

	const expectedUser = process.env.NC_ADMIN_USER?.trim() || 'admin';
	const expectedPassword = process.env.NC_ADMIN_PASSWORD?.trim() || 'parity-test-password';

	return credentials.username === expectedUser && credentials.password === expectedPassword;
}
