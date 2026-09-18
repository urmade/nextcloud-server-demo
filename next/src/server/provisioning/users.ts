import { findParityUser } from '@/src/server/config/users';
import { isAdminUserId } from '@/src/server/ocs/admin-auth';
import {
	getEditableFieldsForUser,
	getProvisioningSubadminGroups,
	getProvisioningUser,
	isUserAccessibleToManager,
	type ProvisioningUserRecord,
} from '@/src/server/provisioning/store';

export interface ProvisioningUserDetails {
	id: string;
	displayname: string;
	'display-name': string;
	email: string;
	additional_mail: string[];
	groups: string[];
	subadmin: string[];
	quota: {
		free: number;
		quota: number;
		relative: number;
		total: number;
		used: number;
	};
	enabled?: boolean;
	backend: string;
	backendCapabilities: {
		setDisplayName: boolean;
		setPassword: boolean;
	};
	phone: string;
	address: string;
	website: string;
	twitter: string;
	bluesky: string;
	fediverse: string;
	organisation: string;
	role: string;
	headline: string;
	biography: string;
	profile_enabled: string;
	pronouns: string;
	language: string;
	locale: string;
	timezone: string;
	manager: string;
	notify_email: string;
	firstLoginTimestamp: number;
	lastLoginTimestamp: number;
	lastLogin: number;
	storageLocation?: string;
	emailScope?: string;
	displaynameScope?: string;
	additional_mailScope?: string[];
	phoneScope?: string;
	addressScope?: string;
	websiteScope?: string;
	twitterScope?: string;
	blueskyScope?: string;
	fediverseScope?: string;
	organisationScope?: string;
	roleScope?: string;
	headlineScope?: string;
	biographyScope?: string;
	profile_enabledScope?: string;
	pronounsScope?: string;
}

function buildQuota(): ProvisioningUserDetails['quota'] {
	return {
		quota: -3,
		used: 0,
		free: -3,
		total: 0,
		relative: 0,
	};
}

function appendScopes(
	details: ProvisioningUserDetails,
	user: ProvisioningUserRecord,
): void {
	details.emailScope = 'v2-local';
	details.displaynameScope = 'v2-local';
	details.additional_mailScope = user.additionalMail.map(() => 'v2-local');
	details.phoneScope = user.properties.phone.scope;
	details.addressScope = user.properties.address.scope;
	details.websiteScope = user.properties.website.scope;
	details.twitterScope = user.properties.twitter.scope;
	details.blueskyScope = user.properties.bluesky.scope;
	details.fediverseScope = user.properties.fediverse.scope;
	details.organisationScope = user.properties.organisation.scope;
	details.roleScope = user.properties.role.scope;
	details.headlineScope = user.properties.headline.scope;
	details.biographyScope = user.properties.biography.scope;
	details.profile_enabledScope = user.properties.profile_enabled.scope;
	details.pronounsScope = user.properties.pronouns.scope;
}

export function buildProvisioningUserDetails(
	targetUserId: string,
	callerUserId: string,
	includeScopes = false,
): ProvisioningUserDetails | null {
	const user = getProvisioningUser(targetUserId);

	if (!user) {
		return null;
	}

	const isSelf = callerUserId === targetUserId;
	const isAdmin = isAdminUserId(callerUserId);

	if (!isSelf && !isAdmin && !isUserAccessibleToManager(callerUserId, targetUserId)) {
		return null;
	}

	const parityUser = findParityUser(user.id);
	const displayName = parityUser?.displayName ?? user.displayName;

	const details: ProvisioningUserDetails = {
		id: user.id,
		displayname: displayName,
		'display-name': displayName,
		email: user.email,
		additional_mail: [...user.additionalMail],
		groups: [...user.groups],
		subadmin: getProvisioningSubadminGroups(user.id),
		quota: buildQuota(),
		enabled: user.enabled,
		backend: 'Database',
		backendCapabilities: {
			setDisplayName: true,
			setPassword: true,
		},
		phone: user.properties.phone.value,
		address: user.properties.address.value,
		website: user.properties.website.value,
		twitter: user.properties.twitter.value,
		bluesky: user.properties.bluesky.value,
		fediverse: user.properties.fediverse.value,
		organisation: user.properties.organisation.value,
		role: user.properties.role.value,
		headline: user.properties.headline.value,
		biography: user.properties.biography.value,
		profile_enabled: user.properties.profile_enabled.value,
		pronouns: user.properties.pronouns.value,
		language: user.language,
		locale: user.locale,
		timezone: user.timezone,
		manager: user.manager,
		notify_email: user.notifyEmail,
		firstLoginTimestamp: user.firstLoginTimestamp,
		lastLoginTimestamp: user.lastLoginTimestamp,
		lastLogin: user.lastLoginTimestamp * 1000,
	};

	if (isAdmin) {
		details.storageLocation = `/var/www/html/data/${user.id}`;
	}

	if (includeScopes) {
		appendScopes(details, user);
	}

	return details;
}

export function getEditableFieldsResponse(userId: string): string[] {
	return getEditableFieldsForUser(userId);
}
