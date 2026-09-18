import { findParityUser, getParityUsers } from '@/src/server/config/users';
import { findParityGroup, getParityGroups } from '@/src/server/config/groups';
import { getConfiguredAdminUserId, isAdminUserId } from '@/src/server/ocs/admin-auth';
import { markAllAppPasswordTokensForWipe } from '@/src/server/ocs/app-password-store';
import { resetKnownUsersStore } from '@/src/server/provisioning/known-users';
import { resetMailVerifyStore } from '@/src/server/provisioning/mail-verify';
import { resetParityProvisioningConfig } from '@/src/server/provisioning/config';
import { resetParityPreferenceListeners } from '@/src/server/provisioning/preference-events';
import { resetUserPreferencesStore } from '@/src/server/provisioning/preference-store';

export type AccountScope = 'v2-private' | 'v2-local' | 'v2-federated' | 'v2-published';

export interface ProvisioningAccountProperty {
	value: string;
	scope: AccountScope;
	editable: boolean;
}

export interface ProvisioningUserRecord {
	id: string;
	displayName: string;
	email: string;
	additionalMail: string[];
	enabled: boolean;
	groups: string[];
	subadminGroups: string[];
	language: string;
	locale: string;
	timezone: string;
	manager: string;
	notifyEmail: string;
	quota: string;
	firstDayOfWeek: string;
	additionalMailScopes: Record<string, AccountScope>;
	firstLoginTimestamp: number;
	lastLoginTimestamp: number;
	properties: Record<string, ProvisioningAccountProperty>;
}

const DEFAULT_SCOPE: AccountScope = 'v2-local';

const ACCOUNT_PROPERTY_IDS = [
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

const DEFAULT_ENABLED_APPS = [
	'activity',
	'circles',
	'cloud_federation_api',
	'dav',
	'federatedfilesharing',
	'federation',
	'files',
	'files_sharing',
	'files_trashbin',
	'files_versions',
	'lookup_server_connector',
	'oauth2',
	'provisioning_api',
	'settings',
	'sharebymail',
	'systemtags',
	'theming',
	'twofactor_backupcodes',
	'updatenotification',
	'user_status',
	'weather_status',
	'workflowengine',
] as const;

const globalForProvisioning = globalThis as typeof globalThis & {
	__ncProvisioningUsers?: Map<string, ProvisioningUserRecord>;
	__ncProvisioningSubadmins?: Map<string, Set<string>>;
	__ncDelegatedUsersAdmins?: Set<string>;
	__ncProvisioningRuntimeGroups?: Set<string>;
};

function defaultProperties(): Record<string, ProvisioningAccountProperty> {
	const properties: Record<string, ProvisioningAccountProperty> = {};

	for (const propertyId of ACCOUNT_PROPERTY_IDS) {
		properties[propertyId] = {
			value: '',
			scope: DEFAULT_SCOPE,
			editable: true,
		};
	}

	return properties;
}

function buildDefaultUser(
	id: string,
	displayName: string,
	email: string,
	groups: string[],
	subadminGroups: string[] = [],
): ProvisioningUserRecord {
	return {
		id,
		displayName,
		email,
		additionalMail: [],
		enabled: true,
		groups,
		subadminGroups,
		language: 'en',
		locale: 'en',
		timezone: 'UTC',
		manager: '',
		notifyEmail: email,
		quota: 'default',
		firstDayOfWeek: '-1',
		additionalMailScopes: {},
		firstLoginTimestamp: 1_700_000_000,
		lastLoginTimestamp: 1_700_100_000,
		properties: defaultProperties(),
	};
}

function seedDefaultUsers(): Map<string, ProvisioningUserRecord> {
	const users = new Map<string, ProvisioningUserRecord>();
	const adminId = getConfiguredAdminUserId();

	for (const parityUser of getParityUsers()) {
		const groups = getParityGroups()
			.filter((group) => group.members.includes(parityUser.id))
			.map((group) => group.id);

		const isAdmin = parityUser.id === adminId;

		users.set(
			parityUser.id,
			buildDefaultUser(
				parityUser.id,
				parityUser.displayName,
				isAdmin ? 'admin@parity.test' : `${parityUser.id}@parity.test`,
				groups.length > 0 ? groups : ['parity-users'],
				[],
			),
		);
	}

	const adminRecord = users.get(adminId);

	if (adminRecord) {
		adminRecord.properties.phone.value = '+4971125242890';
	}

	return users;
}

function getUsersMap(): Map<string, ProvisioningUserRecord> {
	if (!globalForProvisioning.__ncProvisioningUsers) {
		globalForProvisioning.__ncProvisioningUsers = seedDefaultUsers();
	}

	return globalForProvisioning.__ncProvisioningUsers;
}

function getSubadminMap(): Map<string, Set<string>> {
	if (!globalForProvisioning.__ncProvisioningSubadmins) {
		globalForProvisioning.__ncProvisioningSubadmins = new Map();
	}

	return globalForProvisioning.__ncProvisioningSubadmins;
}

export function getProvisioningUser(userId: string): ProvisioningUserRecord | null {
	return getUsersMap().get(userId) ?? null;
}

export function listProvisioningUserIds(): string[] {
	return [...getUsersMap().keys()];
}

export function listProvisioningUserRecords(): ProvisioningUserRecord[] {
	return [...getUsersMap().values()];
}

export function isDelegatedUsersAdmin(userId: string): boolean {
	return globalForProvisioning.__ncDelegatedUsersAdmins?.has(userId) ?? false;
}

export function setDelegatedUsersAdmin(userId: string, enabled: boolean): void {
	if (!globalForProvisioning.__ncDelegatedUsersAdmins) {
		globalForProvisioning.__ncDelegatedUsersAdmins = new Set();
	}

	if (enabled) {
		globalForProvisioning.__ncDelegatedUsersAdmins.add(userId);
	} else {
		globalForProvisioning.__ncDelegatedUsersAdmins.delete(userId);
	}
}

export function setProvisioningSubadminGroups(userId: string, groups: string[]): void {
	const subadminMap = getSubadminMap();
	subadminMap.set(userId, new Set(groups));

	const user = getProvisioningUser(userId);

	if (user) {
		user.subadminGroups = [...groups];
	}
}

export function setProvisioningUserEnabled(userId: string, enabled: boolean): void {
	const user = getProvisioningUser(userId);

	if (user) {
		user.enabled = enabled;
	}
}

export function setProvisioningUserLastLogin(userId: string, lastLoginTimestamp: number): void {
	const user = getProvisioningUser(userId);

	if (user) {
		user.lastLoginTimestamp = lastLoginTimestamp;
	}
}

export function groupExists(groupId: string): boolean {
	return findParityGroup(groupId) !== undefined
		|| (globalForProvisioning.__ncProvisioningRuntimeGroups?.has(groupId) ?? false);
}

export function isUserInAdminGroup(userId: string): boolean {
	if (userId === getConfiguredAdminUserId()) {
		return true;
	}

	const user = getProvisioningUser(userId);

	return Boolean(user?.groups.includes('admin'));
}

export function canManageTargetUser(callerId: string, targetUserId: string): boolean {
	if (isAdminUserId(callerId)) {
		return true;
	}

	if (isDelegatedUsersAdmin(callerId) && !isUserInAdminGroup(targetUserId)) {
		return true;
	}

	return isUserAccessibleToManager(callerId, targetUserId);
}

export function canResendWelcomeToUser(callerId: string, targetUserId: string): boolean {
	if (isAdminUserId(callerId) || isDelegatedUsersAdmin(callerId)) {
		return true;
	}

	return isUserAccessibleToManager(callerId, targetUserId);
}

export interface CreateProvisioningUserInput {
	userid: string;
	password: string;
	displayName?: string;
	email?: string;
	groups?: string[];
	subadminGroups?: string[];
	quota?: string;
	language?: string;
	manager?: string | null;
}

export function createProvisioningUser(input: CreateProvisioningUserInput): ProvisioningUserRecord {
	if (!input.userid || getProvisioningUser(input.userid)) {
		throw new Error('USER_CREATION_FAILED');
	}

	if (input.password.length < 8) {
		throw new Error('PASSWORD_POLICY');
	}

	const groups = input.groups && input.groups.length > 0 ? [...input.groups] : ['parity-users'];
	const record = buildDefaultUser(
		input.userid,
		input.displayName || input.userid,
		input.email !== undefined ? input.email : `${input.userid}@parity.test`,
		groups,
		input.subadminGroups ?? [],
	);

	if (input.language) {
		record.language = input.language;
	}

	if (input.manager !== undefined) {
		record.manager = input.manager ?? '';
	}

	getUsersMap().set(input.userid, record);

	if (input.subadminGroups && input.subadminGroups.length > 0) {
		setProvisioningSubadminGroups(input.userid, input.subadminGroups);
	}

	for (const groupId of groups) {
		if (!globalForProvisioning.__ncProvisioningRuntimeGroups) {
			globalForProvisioning.__ncProvisioningRuntimeGroups = new Set();
		}

		globalForProvisioning.__ncProvisioningRuntimeGroups.add(groupId);
	}

	return record;
}

export function deleteProvisioningUser(userId: string): boolean {
	return getUsersMap().delete(userId);
}

export function setProvisioningUserEmail(userId: string, email: string): void {
	const user = getProvisioningUser(userId);

	if (user) {
		user.email = email;
		user.notifyEmail = email;
	}
}

export function markAllTokensForWipe(userId: string): void {
	markAllAppPasswordTokensForWipe(userId);
}

export function isProvisioningSubAdmin(userId: string): boolean {
	const explicit = getSubadminMap().get(userId);

	if (explicit && explicit.size > 0) {
		return true;
	}

	const user = getProvisioningUser(userId);

	return Boolean(user && user.subadminGroups.length > 0);
}

export function getProvisioningSubadminGroups(userId: string): string[] {
	const explicit = getSubadminMap().get(userId);

	if (explicit && explicit.size > 0) {
		return [...explicit];
	}

	return getProvisioningUser(userId)?.subadminGroups ?? [];
}

export function isUserAccessibleToManager(managerId: string, targetUserId: string): boolean {
	if (managerId === targetUserId) {
		return true;
	}

	const manager = getProvisioningUser(managerId);
	const target = getProvisioningUser(targetUserId);

	if (!manager || !target) {
		return false;
	}

	if (managerId === getConfiguredAdminUserId()) {
		return true;
	}

	if (!isProvisioningSubAdmin(managerId)) {
		return false;
	}

	const managedGroups = new Set(getProvisioningSubadminGroups(managerId));

	return target.groups.some((groupId) => managedGroups.has(groupId));
}

export function getEnabledAppsForUser(userId: string): string[] {
	if (!getProvisioningUser(userId)) {
		return [];
	}

	return [...DEFAULT_ENABLED_APPS];
}

export const EDITABLE_ACCOUNT_FIELDS = [
	'displayname',
	'email',
	...ACCOUNT_PROPERTY_IDS,
	'additional_mail',
] as const;

export function getEditableFieldsForUser(userId: string): string[] {
	const user = getProvisioningUser(userId);

	if (!user) {
		return [];
	}

	return EDITABLE_ACCOUNT_FIELDS.filter((field) => {
		if (field === 'displayname' || field === 'email' || field === 'additional_mail') {
			return true;
		}

		return user.properties[field]?.editable ?? false;
	});
}

export function searchUsersByPhone(phoneNumbers: string[]): Record<string, string> {
	const matches: Record<string, string> = {};

	for (const [userId, user] of getUsersMap()) {
		const phone = user.properties.phone?.value ?? '';

		if (phone && phoneNumbers.includes(phone)) {
			matches[phone] = userId;
		}
	}

	return matches;
}

export function resetProvisioningStore(): void {
	globalForProvisioning.__ncProvisioningUsers = seedDefaultUsers();
	globalForProvisioning.__ncProvisioningSubadmins = new Map();
	globalForProvisioning.__ncDelegatedUsersAdmins = new Set();
	globalForProvisioning.__ncProvisioningRuntimeGroups = new Set();
	resetKnownUsersStore();
	resetMailVerifyStore();
	resetParityProvisioningConfig();
	resetParityPreferenceListeners();
	resetUserPreferencesStore();
}
