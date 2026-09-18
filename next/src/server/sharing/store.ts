import { findParityUser } from '@/src/server/config/users';
import type {
	SharingPropertyRecord,
	SharingRecipientRecord,
	SharingSharePermissionRecord,
	SharingSourceRecord,
} from '@/src/server/sharing/types';

export type SharingState = 'active' | 'draft' | 'deleted';
export type SharingUserStatus = 'pending' | 'accepted' | 'rejected';

export interface SharingShareRecord {
	id: string;
	ownerId: string;
	lastUpdatedMs: string;
	state: SharingState;
	userStatus: SharingUserStatus | null;
	sources: SharingSourceRecord[];
	recipients: SharingRecipientRecord[];
	properties?: SharingPropertyRecord[];
	permissions?: SharingSharePermissionRecord[];
	permissionPreset?: string | null;
}

const globalForSharing = globalThis as typeof globalThis & {
	__ncSharingV1Store?: SharingShareRecord[];
	__ncSharingV1NextId?: number;
};

function getShares(): SharingShareRecord[] {
	if (!globalForSharing.__ncSharingV1Store) {
		globalForSharing.__ncSharingV1Store = [];
	}

	return globalForSharing.__ncSharingV1Store;
}

function nextShareId(): string {
	if (!globalForSharing.__ncSharingV1NextId) {
		globalForSharing.__ncSharingV1NextId = 1;
	}

	const id = globalForSharing.__ncSharingV1NextId;
	globalForSharing.__ncSharingV1NextId += 1;

	if (process.env.NC_PARITY_DETERMINISTIC_SHARE_TOKENS === 'true') {
		return String(1_700_000_000_000_000 + id);
	}

	return String(Date.now() * 1_000 + id);
}

function touchShare(share: SharingShareRecord): SharingShareRecord {
	share.lastUpdatedMs = String(Date.now());

	return share;
}

function recipientKey(recipient: Pick<SharingRecipientRecord, 'class' | 'value' | 'instance'>): string {
	return `${recipient.class}\0${recipient.value}\0${recipient.instance ?? ''}`;
}

export function resetSharingV1Store(): void {
	globalForSharing.__ncSharingV1NextId = 1;
	getShares().length = 0;
}

export function seedSharingShare(share: SharingShareRecord): void {
	const existing = getSharingShareById(share.id);

	if (!existing) {
		getShares().push({
			...share,
			sources: share.sources ?? [],
			recipients: share.recipients ?? [],
			properties: share.properties ?? [],
			permissions: share.permissions ?? [],
			permissionPreset: share.permissionPreset ?? null,
		});
	}
}

export function createSharingShare(ownerId: string): SharingShareRecord {
	const share: SharingShareRecord = {
		id: nextShareId(),
		ownerId,
		lastUpdatedMs: String(Date.now()),
		state: 'draft',
		userStatus: null,
		sources: [],
		recipients: [],
		properties: [],
		permissions: [],
		permissionPreset: null,
	};

	getShares().push(share);

	return share;
}

export function getSharingShareById(id: string): SharingShareRecord | undefined {
	return getShares().find((share) => share.id === id);
}

export function listSharingShares(
	userId: string,
	lastShareId: string | null,
	limit: number,
): SharingShareRecord[] {
	const owned = getShares()
		.filter((share) => share.ownerId === userId)
		.filter((share) => lastShareId === null || share.id > lastShareId)
		.sort((left, right) => left.id.localeCompare(right.id))
		.slice(0, limit);

	return owned;
}

export function deleteSharingShare(id: string): boolean {
	const index = getShares().findIndex((share) => share.id === id);

	if (index < 0) {
		return false;
	}

	getShares().splice(index, 1);

	return true;
}

export function addSharingShareSource(
	shareId: string,
	sourceClass: string,
	sourceValue: string,
): SharingShareRecord | undefined {
	const share = getSharingShareById(shareId);

	if (!share) {
		return undefined;
	}

	const exists = share.sources.some((source) => source.class === sourceClass && source.value === sourceValue);

	if (!exists) {
		share.sources.push({ class: sourceClass, value: sourceValue });
	}

	return touchShare(share);
}

export function removeSharingShareSource(
	shareId: string,
	sourceClass: string,
	sourceValue: string,
): SharingShareRecord | undefined {
	const share = getSharingShareById(shareId);

	if (!share) {
		return undefined;
	}

	share.sources = share.sources.filter((source) => !(source.class === sourceClass && source.value === sourceValue));

	return touchShare(share);
}

export function addSharingShareRecipient(
	shareId: string,
	recipientClass: string,
	recipientValue: string,
	recipientInstance: string | null,
): SharingShareRecord | undefined {
	const share = getSharingShareById(shareId);

	if (!share) {
		return undefined;
	}

	const key = recipientKey({ class: recipientClass, value: recipientValue, instance: recipientInstance });
	const exists = share.recipients.some((recipient) => recipientKey(recipient) === key);

	if (!exists) {
		share.recipients.push({
			class: recipientClass,
			value: recipientValue,
			instance: recipientInstance,
			secret: null,
			permissions: [],
		});
	}

	return touchShare(share);
}

export function removeSharingShareRecipient(
	shareId: string,
	recipientClass: string,
	recipientValue: string,
	recipientInstance: string | null,
): SharingShareRecord | undefined {
	const share = getSharingShareById(shareId);

	if (!share) {
		return undefined;
	}

	const key = recipientKey({ class: recipientClass, value: recipientValue, instance: recipientInstance });
	share.recipients = share.recipients.filter((recipient) => recipientKey(recipient) !== key);

	return touchShare(share);
}

export function updateSharingShareRecipientSecret(
	shareId: string,
	recipientClass: string,
	recipientValue: string,
	recipientInstance: string | null,
	secret: string,
): SharingShareRecord | undefined {
	const share = getSharingShareById(shareId);

	if (!share) {
		return undefined;
	}

	const key = recipientKey({ class: recipientClass, value: recipientValue, instance: recipientInstance });
	const recipient = share.recipients.find((entry) => recipientKey(entry) === key);

	if (!recipient) {
		return touchShare(share);
	}

	recipient.secret = secret;

	return touchShare(share);
}

export function updateSharingShareRecipientPermission(
	shareId: string,
	recipientClass: string,
	recipientValue: string,
	recipientInstance: string | null,
	permissionClass: string,
	enabled: boolean,
): SharingShareRecord | undefined {
	const share = getSharingShareById(shareId);

	if (!share) {
		return undefined;
	}

	const key = recipientKey({ class: recipientClass, value: recipientValue, instance: recipientInstance });
	const recipient = share.recipients.find((entry) => recipientKey(entry) === key);

	if (!recipient) {
		return touchShare(share);
	}

	const permission = recipient.permissions.find((entry) => entry.class === permissionClass);

	if (permission) {
		permission.enabled = enabled;
	} else {
		recipient.permissions.push({ class: permissionClass, enabled });
	}

	return touchShare(share);
}

export function updateSharingShareState(
	shareId: string,
	state: SharingState,
): SharingShareRecord | undefined {
	const share = getSharingShareById(shareId);

	if (!share) {
		return undefined;
	}

	share.state = state;

	return touchShare(share);
}

export function updateSharingShareUserStatus(
	shareId: string,
	userStatus: SharingUserStatus,
): SharingShareRecord | undefined {
	const share = getSharingShareById(shareId);

	if (!share) {
		return undefined;
	}

	share.userStatus = userStatus;

	return touchShare(share);
}

export function updateSharingShareProperty(
	shareId: string,
	propertyClass: string,
	value: string | null,
): SharingShareRecord | undefined {
	const share = getSharingShareById(shareId);

	if (!share) {
		return undefined;
	}

	const existing = (share.properties ?? []).find((property) => property.class === propertyClass);

	if (existing) {
		existing.value = value;
	} else {
		if (!share.properties) {
			share.properties = [];
		}

		share.properties.push({ class: propertyClass, value });
	}

	return touchShare(share);
}

export function updateSharingSharePermission(
	shareId: string,
	permissionClass: string,
	enabled: boolean,
): SharingShareRecord | undefined {
	const share = getSharingShareById(shareId);

	if (!share) {
		return undefined;
	}

	const existing = (share.permissions ?? []).find((permission) => permission.class === permissionClass);

	if (existing) {
		existing.enabled = enabled;
	} else {
		if (!share.permissions) {
			share.permissions = [];
		}

		share.permissions.push({ class: permissionClass, enabled });
	}

	return touchShare(share);
}

export function selectSharingSharePermissionPreset(
	shareId: string,
	presetClass: string,
): SharingShareRecord | undefined {
	const share = getSharingShareById(shareId);

	if (!share) {
		return undefined;
	}

	share.permissionPreset = presetClass;

	return touchShare(share);
}

export function formatSharingOwner(request: Request, userId: string) {
	const user = findParityUser(userId);
	const origin = new URL(request.url).origin;

	return {
		user_id: userId,
		instance: null,
		display_name: user?.displayName ?? userId,
		icon: {
			light: `${origin}/index.php/avatar/${userId}/64`,
			dark: `${origin}/index.php/avatar/${userId}/64/dark`,
		},
	};
}

function formatSharingSource(source: SharingSourceRecord) {
	return {
		class: source.class,
		value: source.value,
		display_name: source.value,
		icon: null,
	};
}

function formatSharingRecipient(request: Request, recipient: SharingRecipientRecord) {
	return {
		class: recipient.class,
		value: recipient.value,
		instance: recipient.instance,
		display_name: recipient.value,
		icon: null,
		secret: {
			updatable: recipient.secret !== null,
			...(recipient.secret ? { value: recipient.secret } : {}),
		},
		initiator: formatSharingOwner(request, 'admin'),
		permissions: recipient.permissions.map((permission) => ({
			class: permission.class,
			source_class: null,
			display_name: permission.class,
			hint: null,
			priority: 50,
			presets: [],
			enabled: permission.enabled,
		})),
	};
}

export function formatSharingShare(request: Request, share: SharingShareRecord) {
	return {
		id: share.id,
		owner: formatSharingOwner(request, share.ownerId),
		last_updated: share.lastUpdatedMs,
		state: share.state,
		user_status: share.userStatus,
		sources: share.sources.map(formatSharingSource),
		recipients: share.recipients.map((recipient) => formatSharingRecipient(request, recipient)),
		properties: (share.properties ?? []).map((property) => ({
			class: property.class,
			value: property.value,
			display_name: property.class,
		})),
		permissions: (share.permissions ?? []).map((permission) => ({
			class: permission.class,
			source_class: null,
			display_name: permission.class,
			hint: null,
			priority: 50,
			presets: [],
			enabled: permission.enabled,
		})),
		permission_preset: share.permissionPreset ?? null,
	};
}
