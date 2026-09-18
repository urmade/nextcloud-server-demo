import { requireAuthenticatedUser } from '@/src/server/ocs/auth';
import {
	ocsFailureResponse,
	ocsSuccessResponse,
	parseOcsVersion,
} from '@/src/server/ocs/respond';
import { requireAdminOrSubAdmin } from '@/src/server/provisioning/auth';
import {
	buildProvisioningUserDetails,
	getEditableFieldsResponse,
} from '@/src/server/provisioning/users';
import {
	getEnabledAppsForUser,
	getProvisioningUser,
	isUserAccessibleToManager,
} from '@/src/server/provisioning/store';

export function handleGetCurrentUser(request: Request): Response {
	const caller = requireAuthenticatedUser(request);

	if (caller instanceof Response) {
		return caller;
	}

	const ocsVersion = parseOcsVersion(request);
	const details = buildProvisioningUserDetails(caller, caller, true);

	if (!details) {
		return ocsFailureResponse(ocsVersion, 998, '', {});
	}

	return ocsSuccessResponse(details, ocsVersion);
}

export function handleGetEditableFields(request: Request): Response {
	const caller = requireAuthenticatedUser(request);

	if (caller instanceof Response) {
		return caller;
	}

	const ocsVersion = parseOcsVersion(request);

	return ocsSuccessResponse(getEditableFieldsResponse(caller), ocsVersion);
}

export function handleGetEditableFieldsForUser(request: Request, userId: string): Response {
	const caller = requireAuthenticatedUser(request);

	if (caller instanceof Response) {
		return caller;
	}

	const ocsVersion = parseOcsVersion(request);
	const target = getProvisioningUser(userId);

	if (!target) {
		return ocsFailureResponse(ocsVersion, 998, '', {});
	}

	if (caller !== userId && !isUserAccessibleToManager(caller, userId)) {
		return ocsFailureResponse(ocsVersion, 998, '', {});
	}

	return ocsSuccessResponse(getEditableFieldsResponse(userId), ocsVersion);
}

export function handleGetUser(request: Request, userId: string): Response {
	const caller = requireAuthenticatedUser(request);

	if (caller instanceof Response) {
		return caller;
	}

	const ocsVersion = parseOcsVersion(request);
	const target = getProvisioningUser(userId);

	if (!target) {
		return ocsFailureResponse(ocsVersion, 998, 'User does not exist', {});
	}

	const includeScopes = caller === userId;
	const details = buildProvisioningUserDetails(userId, caller, includeScopes);

	if (!details) {
		return ocsFailureResponse(ocsVersion, 998, '', {});
	}

	return ocsSuccessResponse(details, ocsVersion);
}

export function handleGetEnabledApps(request: Request): Response {
	const caller = requireAdminOrSubAdmin(request);

	if (caller instanceof Response) {
		return caller;
	}

	const ocsVersion = parseOcsVersion(request);

	return ocsSuccessResponse({ apps: getEnabledAppsForUser(caller) }, ocsVersion);
}
