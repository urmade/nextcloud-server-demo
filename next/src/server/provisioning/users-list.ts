import { findParityUser } from '@/src/server/config/users';
import { getParityGroups } from '@/src/server/config/groups';
import { isAdminUserId } from '@/src/server/ocs/admin-auth';
import { ocsSuccessResponse, parseOcsVersion } from '@/src/server/ocs/respond';
import { requireAdminOrSubAdmin, requireAdminOrUsersDelegated } from '@/src/server/provisioning/auth';
import {
	getProvisioningUser,
	isDelegatedUsersAdmin,
	isProvisioningSubAdmin,
	getProvisioningSubadminGroups,
	listProvisioningUserRecords,
	type ProvisioningUserRecord,
} from '@/src/server/provisioning/store';
import { buildProvisioningUserDetails } from '@/src/server/provisioning/users';

interface ListQuery {
	search: string;
	limit: number | null;
	offset: number;
}

function parseListQuery(request: Request): ListQuery {
	const url = new URL(request.url);
	const search = url.searchParams.get('search') ?? '';
	const limitRaw = url.searchParams.get('limit');
	const limit = limitRaw === null || limitRaw === '' ? null : Number(limitRaw);
	const offset = Number(url.searchParams.get('offset') ?? '0');

	if ((limit !== null && limit < 0) || offset < 0) {
		throw new Error('Invalid limit or offset');
	}

	return { search, limit, offset };
}

function getDisplayName(userId: string): string {
	const user = getProvisioningUser(userId);
	const parityUser = findParityUser(userId);

	return parityUser?.displayName ?? user?.displayName ?? userId;
}

function matchesSearch(userId: string, search: string): boolean {
	if (!search) {
		return true;
	}

	const lower = search.toLowerCase();
	const displayName = getDisplayName(userId);

	return userId.toLowerCase().includes(lower) || displayName.toLowerCase().includes(lower);
}

function shouldListAllUsers(callerId: string): boolean {
	return isAdminUserId(callerId)
		|| (isDelegatedUsersAdmin(callerId) && isProvisioningSubAdmin(callerId));
}

function applyPagination(ids: string[], offset: number, limit: number | null): string[] {
	let result = ids;

	if (offset > 0) {
		result = result.slice(offset);
	}

	if (limit !== null) {
		result = result.slice(0, limit);
	}

	return result;
}

function listAllUserIds(query: ListQuery): string[] {
	const ids = listProvisioningUserRecords()
		.filter((user) => matchesSearch(user.id, query.search))
		.map((user) => user.id)
		.sort();

	return applyPagination(ids, query.offset, query.limit);
}

function listSubadminUserIds(callerId: string, query: ListQuery): string[] {
	const groups = getProvisioningSubadminGroups(callerId);
	const seen = new Set<string>();
	const result: string[] = [];

	for (const groupId of groups) {
		const group = getParityGroups().find((entry) => entry.id === groupId);
		const members = (group?.members ?? []).filter((userId) => {
			return getProvisioningUser(userId) && matchesSearch(userId, query.search);
		});
		const paginated = applyPagination(members, query.offset, query.limit);

		for (const userId of paginated) {
			if (!seen.has(userId)) {
				seen.add(userId);
				result.push(userId);
			}
		}
	}

	return result.sort();
}

function resolveUserIds(callerId: string, query: ListQuery): string[] {
	if (shouldListAllUsers(callerId)) {
		return listAllUserIds(query);
	}

	return listSubadminUserIds(callerId, query);
}

function buildGroupsForUsers(userIds: string[]): Array<{ id: string; displayname: string }> {
	const groupIds = new Set<string>();

	for (const userId of userIds) {
		const user = getProvisioningUser(userId);
		user?.groups.forEach((groupId) => groupIds.add(groupId));
	}

	return [...groupIds].sort().map((groupId) => {
		const group = getParityGroups().find((entry) => entry.id === groupId);

		return {
			id: groupId,
			displayname: group?.displayName ?? groupId,
		};
	});
}

function buildUsersDetailsMap(
	callerId: string,
	userIds: string[],
): Record<string, Record<string, unknown>> {
	const users: Record<string, Record<string, unknown>> = {};

	for (const userId of userIds) {
		const details = buildProvisioningUserDetails(userId, callerId, false);
		users[userId] = (details ?? { id: userId }) as Record<string, unknown>;
	}

	return users;
}

function listDisabledUserIds(callerId: string, query: ListQuery): string[] {
	if (shouldListAllUsers(callerId)) {
		const ids = listProvisioningUserRecords()
			.filter((user) => !user.enabled && matchesSearch(user.id, query.search))
			.map((user) => user.id)
			.sort();

		return applyPagination(ids, query.offset, query.limit);
	}

	const groups = getProvisioningSubadminGroups(callerId);
	const seen = new Set<string>();
	const disabled: string[] = [];

	for (const groupId of groups) {
		const group = getParityGroups().find((entry) => entry.id === groupId);

		for (const userId of group?.members ?? []) {
			const user = getProvisioningUser(userId);

			if (user && !user.enabled && matchesSearch(userId, query.search) && !seen.has(userId)) {
				seen.add(userId);
				disabled.push(userId);
			}
		}
	}

	disabled.sort();

	return applyPagination(disabled, query.offset, query.limit);
}

function listRecentUserIds(query: ListQuery): string[] {
	const ids = listProvisioningUserRecords()
		.filter((user) => matchesSearch(user.id, query.search))
		.sort((left: ProvisioningUserRecord, right: ProvisioningUserRecord) => (
			right.lastLoginTimestamp - left.lastLoginTimestamp
		))
		.map((user) => user.id);

	return applyPagination(ids, query.offset, query.limit);
}

export function handleGetUsers(request: Request): Response {
	const caller = requireAdminOrSubAdmin(request);

	if (caller instanceof Response) {
		return caller;
	}

	const ocsVersion = parseOcsVersion(request);
	const query = parseListQuery(request);

	return ocsSuccessResponse({ users: resolveUserIds(caller, query) }, ocsVersion);
}

export function handleGetUsersDetails(request: Request): Response {
	const caller = requireAdminOrSubAdmin(request);

	if (caller instanceof Response) {
		return caller;
	}

	const ocsVersion = parseOcsVersion(request);
	const query = parseListQuery(request);
	const userIds = resolveUserIds(caller, query);

	return ocsSuccessResponse({
		users: buildUsersDetailsMap(caller, userIds),
		groups: buildGroupsForUsers(userIds),
	}, ocsVersion);
}

export function handleGetDisabledUsersDetails(request: Request): Response {
	const caller = requireAdminOrSubAdmin(request);

	if (caller instanceof Response) {
		return caller;
	}

	const ocsVersion = parseOcsVersion(request);
	const query = parseListQuery(request);
	const userIds = listDisabledUserIds(caller, query);

	return ocsSuccessResponse({
		users: buildUsersDetailsMap(caller, userIds),
	}, ocsVersion);
}

export function handleGetRecentUsers(request: Request): Response {
	const caller = requireAdminOrUsersDelegated(request);

	if (caller instanceof Response) {
		return caller;
	}

	const ocsVersion = parseOcsVersion(request);
	const query = parseListQuery(request);
	const userIds = listRecentUserIds(query);

	return ocsSuccessResponse({
		users: buildUsersDetailsMap(caller, userIds),
	}, ocsVersion);
}
