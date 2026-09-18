import { isValidBasicAuth, parseBasicAuthHeader } from '@/src/server/auth/basic';
import { isAppPasswordTokenFormat, lookupAppPasswordToken } from '@/src/server/ocs/app-password-store';

export function resolveLegacyCardDavUserId(request: Request): string | null {
	const authorization = request.headers.get('authorization');

	if (authorization && /^Bearer\s+/i.test(authorization.trim())) {
		return null;
	}

	const credentials = parseBasicAuthHeader(authorization);

	if (credentials && isAppPasswordTokenFormat(credentials.password)) {
		const stored = lookupAppPasswordToken(credentials.password);

		if (stored && stored.loginName === credentials.username) {
			return stored.userId;
		}
	}

	if (isValidBasicAuth(credentials)) {
		return credentials!.username;
	}

	return null;
}
