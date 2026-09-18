import { setUserPassword } from '@/src/server/auth/credentials';
import { isAdminUserId } from '@/src/server/ocs/admin-auth';
import { requireAuthenticatedUser } from '@/src/server/ocs/auth';
import {
	ocsFailureResponse,
	ocsForbiddenResponse,
	ocsSuccessResponse,
	ocsUnprocessableResponse,
	parseOcsVersion,
} from '@/src/server/ocs/respond';
import { requireAdminOrSubAdmin, requirePasswordConfirmation } from '@/src/server/provisioning/auth';
import { buildProvisioningUserDetails } from '@/src/server/provisioning/users';
import {
	type AccountScope,
	canManageTargetUser,
	getProvisioningSubadminGroups,
	getProvisioningUser,
	groupExists,
	isDelegatedUsersAdmin,
	isProvisioningSubAdmin,
	isUserAccessibleToManager,
	isUserInAdminGroup,
	setProvisioningSubadminGroups,
	type ProvisioningUserRecord,
} from '@/src/server/provisioning/store';

const MAX_PASSWORD_LENGTH = 4096;
const SCOPE_SUFFIX = 'Scope';
const COLLECTION_EMAIL = 'additional_mail';
const COLLECTION_EMAIL_SCOPE = 'additional_mailScope';

const ACCOUNT_PROPERTIES = [
	'phone',
	'address',
	'website',
	'twitter',
	'bluesky',
	'fediverse',
	'organisation',
	'role',
	'headline',
	'biography',
	'profile_enabled',
	'pronouns',
] as const;

const KNOWN_LANGUAGES = new Set(['en', 'de', 'fr', 'es', 'it', 'nl', 'pt', 'ru', 'zh', 'ja']);
const KNOWN_LOCALES = new Set(['en', 'de_DE', 'fr_FR', 'es_ES', 'en_GB']);
const KNOWN_TIMEZONES = new Set(Intl.supportedValuesOf('timeZone'));

interface EditUserBody {
	key?: string;
	value?: string;
}

interface EditUserMultiFieldBody {
	displayName?: string | null;
	password?: string | null;
	email?: string | null;
	quota?: string | null;
	language?: string | null;
	manager?: string | null;
	groups?: string[] | null;
	subadminGroups?: string[] | null;
}

interface EditUserMultiValueBody {
	key?: string;
	value?: string;
}

interface FieldError {
	code: number;
	message?: string;
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

function forbiddenFieldFailure(request: Request): Response {
	return badRequestFailure(request, 113, '');
}

function requireEditAuth(request: Request): string | Response {
	const caller = requireAuthenticatedUser(request);

	if (caller instanceof Response) {
		return caller;
	}

	const passwordConfirmation = requirePasswordConfirmation(request);

	if (passwordConfirmation) {
		return passwordConfirmation;
	}

	return caller;
}

function requirePatchAuth(request: Request): string | Response {
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

function isValidEmail(value: string): boolean {
	return value === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidLanguage(value: string): boolean {
	return KNOWN_LANGUAGES.has(value);
}

function isValidLocale(value: string): boolean {
	return KNOWN_LOCALES.has(value);
}

function isValidTimezone(value: string): boolean {
	return KNOWN_TIMEZONES.has(value);
}

function isValidFirstDayOfWeek(value: string): boolean {
	const intValue = Number.parseInt(value, 10);

	return !Number.isNaN(intValue) && intValue >= -1 && intValue <= 6;
}

function isValidScope(value: string): value is AccountScope {
	return ['v2-private', 'v2-local', 'v2-federated', 'v2-published'].includes(value);
}

function isValidQuota(value: string): boolean {
	if (value === 'default' || value === 'none') {
		return true;
	}

	if (/^\d+$/.test(value)) {
		return true;
	}

	return /^\d+(\.\d+)?\s*(B|KB|MB|GB|TB)$/i.test(value);
}

function normalizeEmail(value: string): string {
	return value.trim().toLowerCase();
}

function getAdditionalMailScopes(user: ProvisioningUserRecord): Record<string, AccountScope> {
	if (!user.additionalMailScopes) {
		user.additionalMailScopes = {};
	}

	return user.additionalMailScopes;
}

function getPermittedPutFields(
	callerId: string,
	target: ProvisioningUserRecord,
	isSelf: boolean,
): string[] {
	const fields: string[] = [];
	const isAdmin = isAdminUserId(callerId);
	const isDelegated = isDelegatedUsersAdmin(callerId);

	if (isSelf) {
		fields.push('displayname', 'display', COLLECTION_EMAIL, 'password', 'notify_email', 'timezone', 'language', 'locale', 'first_day_of_week');

		for (const property of ACCOUNT_PROPERTIES) {
			if (target.properties[property]?.editable ?? false) {
				fields.push(property);
			}

			fields.push(`${property}${SCOPE_SUFFIX}`);
		}

		if (isAdmin || isDelegated) {
			fields.push('quota', 'manager');
		}

		return fields;
	}

	if (!canManageTargetUser(callerId, target.id)) {
		return [];
	}

	return [
		'displayname',
		'display',
		'email',
		COLLECTION_EMAIL,
		'password',
		'language',
		'locale',
		'timezone',
		'first_day_of_week',
		'quota',
		'notify_email',
		'manager',
		...ACCOUNT_PROPERTIES,
	];
}

function applyPutField(
	target: ProvisioningUserRecord,
	key: string,
	value: string,
): FieldError | null {
	switch (key) {
		case 'displayname':
		case 'display':
			target.displayName = value;
			return null;
		case 'quota':
			if (!isValidQuota(value)) {
				return { code: 101, message: 'Invalid quota value' };
			}

			target.quota = value;
			return null;
		case 'manager':
			target.manager = value;
			return null;
		case 'password':
			if (value.length > MAX_PASSWORD_LENGTH) {
				return { code: 101, message: 'Invalid password value' };
			}

			if (value.length < 8) {
				return { code: 107, message: 'Password policy violation' };
			}

			setUserPassword(target.id, value);
			return null;
		case 'language':
			if (!isValidLanguage(value)) {
				return { code: 101, message: 'Invalid language' };
			}

			target.language = value;
			return null;
		case 'locale':
			if (!isValidLocale(value)) {
				return { code: 101, message: 'Invalid locale' };
			}

			target.locale = value;
			return null;
		case 'timezone':
			if (!isValidTimezone(value)) {
				return { code: 101, message: 'Invalid timezone' };
			}

			target.timezone = value;
			return null;
		case 'first_day_of_week':
			if (!isValidFirstDayOfWeek(value)) {
				return { code: 101, message: 'Invalid first day of week' };
			}

			target.firstDayOfWeek = value;
			return null;
		case 'notify_email':
			if (!isValidEmail(value)) {
				return { code: 101 };
			}

			target.notifyEmail = value;
			return null;
		case 'email':
			if (!isValidEmail(value)) {
				return { code: 101 };
			}

			target.email = normalizeEmail(value);
			return null;
		case COLLECTION_EMAIL: {
			const email = normalizeEmail(value);

			if (!isValidEmail(email) || email === target.email || target.additionalMail.includes(email)) {
				return { code: 101 };
			}

			target.additionalMail.push(email);
			getAdditionalMailScopes(target)[email] = 'v2-local';
			return null;
		}
		default:
			if (key.endsWith(SCOPE_SUFFIX)) {
				const property = key.slice(0, -SCOPE_SUFFIX.length);

				if (!isValidScope(value)) {
					return { code: 101 };
				}

				if (property === COLLECTION_EMAIL || !target.properties[property]) {
					return { code: 101 };
				}

				target.properties[property].scope = value;
				return null;
			}

			if ((ACCOUNT_PROPERTIES as readonly string[]).includes(key)) {
				if (!target.properties[key]) {
					return { code: 101 };
				}

				target.properties[key].value = value;
				return null;
			}

			return { code: 101 };
	}
}

export async function handleEditUser(request: Request, userId: string): Promise<Response> {
	const caller = requireEditAuth(request);

	if (caller instanceof Response) {
		return caller;
	}

	const target = getProvisioningUser(userId);

	if (!target) {
		return notFoundFailure(request);
	}

	const isSelf = caller === userId;

	if (!isSelf && !canManageTargetUser(caller, userId)) {
		return notFoundFailure(request);
	}

	const body = await request.json().catch(() => ({})) as EditUserBody;
	const key = typeof body.key === 'string' ? body.key : '';
	const value = typeof body.value === 'string' ? body.value : '';
	const permittedFields = getPermittedPutFields(caller, target, isSelf);

	if (!permittedFields.includes(key)) {
		return forbiddenFieldFailure(request);
	}

	const fieldError = applyPutField(target, key, value);

	if (fieldError) {
		return badRequestFailure(request, fieldError.code, fieldError.message ?? '');
	}

	return emptySuccess(request);
}

export async function handleEditUserMultiField(request: Request, userId: string): Promise<Response> {
	const caller = requirePatchAuth(request);

	if (caller instanceof Response) {
		return caller;
	}

	const ocsVersion = parseOcsVersion(request);
	const target = getProvisioningUser(userId);

	if (!target) {
		return notFoundFailure(request);
	}

	const isSelf = caller === userId;
	const isAdmin = isAdminUserId(caller);
	const isDelegated = isDelegatedUsersAdmin(caller);
	const canEditOther = isAdmin
		|| (isDelegated && !isUserInAdminGroup(userId))
		|| (!isSelf && isUserAccessibleToManager(caller, userId));

	if (!isSelf && !canEditOther) {
		return ocsForbiddenResponse(ocsVersion, 'Insufficient permissions to edit this user', {});
	}

	const body = await request.json().catch(() => ({})) as EditUserMultiFieldBody;
	const errors: Record<string, string> = {};
	const canChangeAllGroups = isAdmin || isDelegated;
	const callerSubadminGroups = new Set(getProvisioningSubadminGroups(caller));
	const currentGroupIds = [...target.groups];
	const currentSubadminGroupIds = [...getProvisioningSubadminGroups(userId)];

	if (body.password !== undefined && body.password !== null) {
		if (body.password.length > MAX_PASSWORD_LENGTH) {
			errors.password = 'Invalid password value';
		} else if (body.password.length < 8) {
			errors.password = 'Password policy violation';
		}
	}

	if (body.email !== undefined && body.email !== null && body.email !== '' && !isValidEmail(body.email)) {
		errors.email = 'Invalid email address';
	}

	if (body.language !== undefined && body.language !== null && !isValidLanguage(body.language)) {
		errors.language = 'Invalid language';
	}

	if (body.quota !== undefined && body.quota !== null) {
		if (!canEditOther) {
			errors.quota = 'Insufficient permissions to change quota';
		} else if (!isValidQuota(body.quota)) {
			errors.quota = `Invalid quota value: ${body.quota}`;
		}
	}

	if (body.manager !== undefined && body.manager !== null && !canEditOther) {
		errors.manager = 'Insufficient permissions to change manager';
	}

	if (body.groups !== undefined && body.groups !== null) {
		if (!canChangeAllGroups && !isUserAccessibleToManager(caller, userId)) {
			errors.groups = 'Insufficient permissions to change groups';
		} else {
			const addedGids = canChangeAllGroups ? [] : body.groups.filter((gid) => !currentGroupIds.includes(gid));

			for (const gid of body.groups) {
				if (!groupExists(gid)) {
					errors.groups = `Group ${gid} does not exist`;
					break;
				}

				if (!canChangeAllGroups && addedGids.includes(gid) && !callerSubadminGroups.has(gid)) {
					errors.groups = `Insufficient privileges for group ${gid}`;
					break;
				}
			}

			if (!canChangeAllGroups && !errors.groups && body.groups.filter((gid) => callerSubadminGroups.has(gid)).length === 0) {
				errors.groups = 'Not viable to remove user from the last group you are sub-admin of';
			}
		}
	}

	if (body.subadminGroups !== undefined && body.subadminGroups !== null) {
		if (!isAdmin && !isDelegated) {
			errors.subadminGroups = 'Insufficient permissions to change sub-admin groups';
		} else {
			for (const gid of body.subadminGroups) {
				if (!groupExists(gid)) {
					errors.subadminGroups = `Group ${gid} does not exist`;
					break;
				}
			}
		}
	}

	if (Object.keys(errors).length > 0) {
		return ocsUnprocessableResponse(ocsVersion, { errors });
	}

	if (body.password !== undefined && body.password !== null) {
		setUserPassword(target.id, body.password);
	}

	if (body.displayName !== undefined && body.displayName !== null) {
		target.displayName = body.displayName !== '' ? body.displayName : userId;
	}

	if (body.email !== undefined && body.email !== null) {
		target.email = normalizeEmail(body.email);
	}

	if (body.quota !== undefined && body.quota !== null) {
		target.quota = body.quota;
	}

	if (body.language !== undefined && body.language !== null) {
		target.language = body.language;
	}

	if (body.manager !== undefined && body.manager !== null) {
		target.manager = body.manager;
	}

	if (body.groups !== undefined && body.groups !== null) {
		for (const gid of currentGroupIds) {
			if (!body.groups.includes(gid) && (canChangeAllGroups || callerSubadminGroups.has(gid))) {
				target.groups = target.groups.filter((groupId) => groupId !== gid);
			}
		}

		for (const gid of body.groups) {
			if (!target.groups.includes(gid) && (isAdmin || gid !== 'admin')) {
				target.groups.push(gid);
			}
		}
	}

	if (body.subadminGroups !== undefined && body.subadminGroups !== null) {
		const nextSubadminGroups = body.subadminGroups.filter((gid) => gid !== 'admin');
		setProvisioningSubadminGroups(userId, nextSubadminGroups);
	} else if (currentSubadminGroupIds.length > 0) {
		setProvisioningSubadminGroups(userId, currentSubadminGroupIds);
	}

	const details = buildProvisioningUserDetails(userId, caller, false);

	if (!details) {
		return notFoundFailure(request);
	}

	return ocsSuccessResponse(details, ocsVersion);
}

export async function handleEditUserMultiValue(
	request: Request,
	userId: string,
	collectionName: string,
): Promise<Response> {
	const caller = requireEditAuth(request);

	if (caller instanceof Response) {
		return caller;
	}

	const target = getProvisioningUser(userId);

	if (!target) {
		return notFoundFailure(request);
	}

	const isSelf = caller === userId;
	const canManageOther = isAdminUserId(caller)
		|| isProvisioningSubAdmin(caller)
		|| (isDelegatedUsersAdmin(caller) && !isUserInAdminGroup(userId))
		|| canManageTargetUser(caller, userId);

	if (!isSelf && !canManageOther) {
		return notFoundFailure(request);
	}

	const permittedCollections = isSelf
		? [COLLECTION_EMAIL, COLLECTION_EMAIL_SCOPE]
		: [COLLECTION_EMAIL];

	if (!permittedCollections.includes(collectionName)) {
		return badRequestFailure(request, 103, '');
	}

	const body = await request.json().catch(() => ({})) as EditUserMultiValueBody;
	const key = typeof body.key === 'string' ? body.key : '';
	const value = typeof body.value === 'string' ? body.value : '';

	if (collectionName === COLLECTION_EMAIL) {
		const normalizedKey = normalizeEmail(key);
		const scopes = getAdditionalMailScopes(target);

		target.additionalMail = target.additionalMail.filter((email) => email !== normalizedKey);
		delete scopes[normalizedKey];

		if (value !== '') {
			const normalizedValue = normalizeEmail(value);
			target.additionalMail.push(normalizedValue);
			scopes[normalizedValue] = 'v2-local';
		}

		if (value === '' && normalizedKey === target.email) {
			target.email = '';
		}

		return emptySuccess(request);
	}

	if (collectionName === COLLECTION_EMAIL_SCOPE) {
		const normalizedKey = normalizeEmail(key);
		const hasMail = target.email === normalizedKey || target.additionalMail.includes(normalizedKey);

		if (!hasMail || !isValidScope(value)) {
			return badRequestFailure(request, 102, '');
		}

		getAdditionalMailScopes(target)[normalizedKey] = value;
		return emptySuccess(request);
	}

	return badRequestFailure(request, 103, '');
}
