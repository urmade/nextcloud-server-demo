import { randomBytes } from 'node:crypto';
import { findParityGroup } from '@/src/server/config/groups';
import { isAdminUserId } from '@/src/server/ocs/admin-auth';
import {
	ocsFailureResponse,
	ocsForbiddenResponse,
	ocsSuccessResponse,
	parseOcsVersion,
} from '@/src/server/ocs/respond';
import { requireAdminOrSubAdmin, requirePasswordConfirmation } from '@/src/server/provisioning/auth';
import {
	getGenerateUserIdEnabled,
	getRequireEmailEnabled,
	getWelcomeMailSendFails,
} from '@/src/server/provisioning/config';
import {
	canManageTargetUser,
	canResendWelcomeToUser,
	createProvisioningUser,
	deleteProvisioningUser,
	getProvisioningSubadminGroups,
	getProvisioningUser,
	groupExists,
	isDelegatedUsersAdmin,
	isProvisioningSubAdmin,
	isUserInAdminGroup,
	markAllTokensForWipe,
	setProvisioningUserEnabled,
} from '@/src/server/provisioning/store';

const PASSWORD_CONFIRMATION_REQUIRED = 'Password confirmation is required';
const MAX_PASSWORD_LENGTH = 4096;
const GENERATED_USER_ID_LENGTH = 10;
const GENERATED_USER_ID_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

interface AddUserBody {
	userid?: string;
	password?: string;
	displayName?: string;
	email?: string;
	groups?: string[];
	subadmin?: string[];
	quota?: string;
	language?: string;
	manager?: string | null;
}

function emptySuccess(request: Request): Response {
	return ocsSuccessResponse([], parseOcsVersion(request));
}

function notFoundFailure(request: Request): Response {
	return ocsFailureResponse(parseOcsVersion(request), 998, '', {});
}

function badRequestFailure(request: Request, statuscode: number, message = ''): Response {
	return ocsFailureResponse(parseOcsVersion(request), statuscode, message, {});
}

function generateUserId(): string {
	const bytes = randomBytes(GENERATED_USER_ID_LENGTH);
	let id = '';

	for (let index = 0; index < GENERATED_USER_ID_LENGTH; index += 1) {
		id += GENERATED_USER_ID_CHARSET[bytes[index] % GENERATED_USER_ID_CHARSET.length];
	}

	return id;
}

function generateSecurePassword(): string {
	const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[randomBytes(1)[0] % 26];
	const lower = 'abcdefghijklmnopqrstuvwxyz'[randomBytes(1)[0] % 26];
	const digit = '0123456789'[randomBytes(1)[0] % 10];
	const symbol = '!@#$%^&*'[randomBytes(1)[0] % 8];
	const randomPart = randomBytes(6).toString('base64url').slice(0, 6);

	return `${randomPart}${upper}${lower}${digit}${symbol}`;
}

async function parseAddUserBody(request: Request): Promise<AddUserBody> {
	const body = await request.json().catch(() => ({}));

	if (!body || typeof body !== 'object') {
		return {};
	}

	return body as AddUserBody;
}

function requireManagedTarget(
	request: Request,
	callerId: string,
	targetUserId: string,
): Response | null {
	const target = getProvisioningUser(targetUserId);

	if (!target) {
		return notFoundFailure(request);
	}

	if (!canManageTargetUser(callerId, targetUserId)) {
		return notFoundFailure(request);
	}

	return null;
}

function requireLifecycleAuth(request: Request): string | Response {
	const caller = requireAdminOrSubAdmin(request);

	if (caller instanceof Response) {
		return caller;
	}

	const passwordConfirmation = requirePasswordConfirmation(request);

	if (passwordConfirmation) {
		return passwordConfirmation;
	}

	return caller;
}

export async function handleAddUser(request: Request): Promise<Response> {
	const caller = requireLifecycleAuth(request);

	if (caller instanceof Response) {
		return caller;
	}

	const ocsVersion = parseOcsVersion(request);
	const body = await parseAddUserBody(request);
	let userid = typeof body.userid === 'string' ? body.userid : '';
	const password = typeof body.password === 'string' ? body.password : '';
	const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
	const groups = Array.isArray(body.groups) ? body.groups.filter((group): group is string => typeof group === 'string') : [];
	const subadmin = Array.isArray(body.subadmin) ? body.subadmin.filter((group): group is string => typeof group === 'string') : [];
	const displayName = typeof body.displayName === 'string' ? body.displayName : '';
	const quota = typeof body.quota === 'string' ? body.quota : '';
	const language = typeof body.language === 'string' ? body.language : '';
	const manager = body.manager === undefined ? undefined : (body.manager ?? '');

	if (userid === '' && getGenerateUserIdEnabled()) {
		let attempts = 0;

		do {
			userid = generateUserId();

			if (!getProvisioningUser(userid)) {
				break;
			}

			attempts += 1;
		} while (attempts < 10);

		if (attempts >= 10) {
			return badRequestFailure(request, 111, 'Could not create non-existing user ID');
		}
	}

	if (getProvisioningUser(userid)) {
		return badRequestFailure(request, 102, 'User already exists');
	}

	const isAdmin = isAdminUserId(caller);
	const isDelegatedAdmin = isDelegatedUsersAdmin(caller);
	const callerSubadminGroups = new Set(getProvisioningSubadminGroups(caller));

	if (groups.length > 0) {
		for (const group of groups) {
			if (!groupExists(group)) {
				return badRequestFailure(request, 104, `Group ${group} does not exist`);
			}

			if (
				!isAdmin
				&& !(isDelegatedAdmin && group !== 'admin')
				&& !callerSubadminGroups.has(group)
			) {
				return badRequestFailure(request, 105, `Insufficient privileges for group ${group}`);
			}
		}
	} else if (!isAdmin && !isDelegatedAdmin) {
		return badRequestFailure(request, 106, 'No group specified (required for sub-admins)');
	}

	for (const groupid of subadmin) {
		if (!groupExists(groupid)) {
			return badRequestFailure(request, 109, 'Sub-admin group does not exist');
		}

		if (groupid === 'admin') {
			return badRequestFailure(request, 103, 'Cannot create sub-admins for admin group');
		}

		if (!callerSubadminGroups.has(groupid) && !isAdmin && !isDelegatedAdmin) {
			return ocsForbiddenResponse(ocsVersion, 'No permissions to promote sub-admins', {});
		}
	}

	if (password.length > MAX_PASSWORD_LENGTH) {
		return badRequestFailure(request, 101, 'Invalid password value');
	}

	let resolvedPassword = password;

	if (resolvedPassword === '') {
		if (email === '') {
			return badRequestFailure(request, 108, 'An email address is required, to send a password link to the user.');
		}

		resolvedPassword = generateSecurePassword();
	}

	if (email === '' && getRequireEmailEnabled()) {
		return badRequestFailure(request, 110, 'Required email address was not provided');
	}

	try {
		createProvisioningUser({
			userid,
			password: resolvedPassword,
			displayName,
			email,
			groups,
			subadminGroups: subadmin,
			quota,
			language,
			manager,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Bad request';

		if (message === 'USER_CREATION_FAILED') {
			return badRequestFailure(request, 111, 'User creation failed');
		}

		if (message === 'PASSWORD_POLICY') {
			return badRequestFailure(request, 107, 'Password policy violation');
		}

		return badRequestFailure(request, 101, message);
	}

	return ocsSuccessResponse({ id: userid }, ocsVersion);
}

export async function handleDeleteUser(request: Request, userId: string): Promise<Response> {
	const caller = requireLifecycleAuth(request);

	if (caller instanceof Response) {
		return caller;
	}

	if (caller === userId) {
		return badRequestFailure(request, 101, '');
	}

	const manageFailure = requireManagedTarget(request, caller, userId);

	if (manageFailure) {
		return manageFailure;
	}

	if (!deleteProvisioningUser(userId)) {
		return badRequestFailure(request, 101, '');
	}

	return emptySuccess(request);
}

export async function handleEnableUser(request: Request, userId: string): Promise<Response> {
	return handleSetEnabled(request, userId, true);
}

export async function handleDisableUser(request: Request, userId: string): Promise<Response> {
	return handleSetEnabled(request, userId, false);
}

async function handleSetEnabled(request: Request, userId: string, enabled: boolean): Promise<Response> {
	const caller = requireLifecycleAuth(request);

	if (caller instanceof Response) {
		return caller;
	}

	const target = getProvisioningUser(userId);

	if (!target || caller === userId) {
		return badRequestFailure(request, 101, '');
	}

	if (!canManageTargetUser(caller, userId)) {
		return notFoundFailure(request);
	}

	setProvisioningUserEnabled(userId, enabled);

	return emptySuccess(request);
}

export async function handleWipeUserDevices(request: Request, userId: string): Promise<Response> {
	const caller = requireLifecycleAuth(request);

	if (caller instanceof Response) {
		return caller;
	}

	if (caller === userId) {
		return badRequestFailure(request, 101, '');
	}

	const manageFailure = requireManagedTarget(request, caller, userId);

	if (manageFailure) {
		return manageFailure;
	}

	markAllTokensForWipe(userId);

	return emptySuccess(request);
}

export async function handleResendWelcomeMessage(request: Request, userId: string): Promise<Response> {
	const caller = requireLifecycleAuth(request);

	if (caller instanceof Response) {
		return caller;
	}

	const target = getProvisioningUser(userId);

	if (!target) {
		return notFoundFailure(request);
	}

	if (!canResendWelcomeToUser(caller, userId)) {
		return notFoundFailure(request);
	}

	if (!target.email) {
		return badRequestFailure(request, 101, 'Email address not available');
	}

	if (getWelcomeMailSendFails()) {
		return badRequestFailure(request, 102, 'Sending email failed');
	}

	return emptySuccess(request);
}
