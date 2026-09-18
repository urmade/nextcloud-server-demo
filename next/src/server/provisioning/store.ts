import { findParityUser, getParityUsers } from '@/src/server/config/users';
import { getParityGroups } from '@/src/server/config/groups';
import { getConfiguredAdminUserId } from '@/src/server/ocs/admin-auth';
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
	resetKnownUsersStore();
	resetMailVerifyStore();
	resetParityProvisioningConfig();
	resetParityPreferenceListeners();
	resetUserPreferencesStore();
}
