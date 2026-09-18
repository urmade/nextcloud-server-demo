import { checkPassword } from '@/src/server/auth/credentials';
import { parseBasicAuthHeader } from '@/src/server/auth/basic';
import { getSessionFromRequest, isAdminUserId } from '@/src/server/ocs/admin-auth';
import { requireAuthenticatedUser } from '@/src/server/ocs/auth';
import { isPasswordConfirmationFresh } from '@/src/server/ocs/app-password-store';
import { isDelegatedUsersAdmin, isProvisioningSubAdmin } from '@/src/server/provisioning/store';
import { ocsForbiddenResponse, parseOcsVersion } from '@/src/server/ocs/respond';

const PASSWORD_CONFIRMATION_REQUIRED = 'Password confirmation is required';

export function requireAdminOrSubAdmin(request: Request): string | Response {
	const userId = requireAuthenticatedUser(request);

	if (userId instanceof Response) {
		return userId;
	}

	if (!isAdminUserId(userId) && !isProvisioningSubAdmin(userId)) {
		return ocsForbiddenResponse(parseOcsVersion(request), '', {});
	}

	return userId;
}

export function requirePasswordConfirmation(request: Request): Response | null {
	const ocsVersion = parseOcsVersion(request);
	const session = getSessionFromRequest(request);

	if (session && isPasswordConfirmationFresh(session.lastPasswordConfirm)) {
		return null;
	}

	const credentials = parseBasicAuthHeader(request.headers.get('authorization'));

	if (credentials && checkPassword(credentials.username, credentials.password)) {
		return null;
	}

	return ocsForbiddenResponse(ocsVersion, PASSWORD_CONFIRMATION_REQUIRED, {}, {
		'x-nc-auth-notconfirmed': 'true',
	});
}

export function requireAdminOrUsersDelegated(request: Request): string | Response {
	const userId = requireAuthenticatedUser(request);

	if (userId instanceof Response) {
		return userId;
	}

	if (!isAdminUserId(userId) && !isDelegatedUsersAdmin(userId)) {
		return ocsForbiddenResponse(parseOcsVersion(request), '', {});
	}

	return userId;
}
