import { isAdminUserId } from '@/src/server/ocs/admin-auth';
import { requireAuthenticatedUser } from '@/src/server/ocs/auth';
import { isDelegatedUsersAdmin, isProvisioningSubAdmin } from '@/src/server/provisioning/store';
import { ocsForbiddenResponse, parseOcsVersion } from '@/src/server/ocs/respond';

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
