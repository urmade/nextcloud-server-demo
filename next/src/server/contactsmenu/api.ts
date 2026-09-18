import { isCsrfTokenValid } from '@/src/server/auth/csrf';
import { parseCookieHeader, SESSION_COOKIE } from '@/src/server/auth/cookies';
import { getSession } from '@/src/server/auth/session-store';
import { findParityUser, getParityUsers } from '@/src/server/config/users';
import { resolveAuthenticatedUserId } from '@/src/server/ocs/auth';
import {
	buildTeamLink,
	findParityTeam,
	hasTeamSupport,
	isTeamMember,
	PARITY_TEAM_ALPHA_ID,
	PARITY_TEAM_BETA_ID,
	PARITY_TEAM_SECRET_ID,
	type ParityTeamFixture,
} from '@/src/server/teams/catalog';

const JSON_HEADERS = {
	'content-type': 'application/json; charset=utf-8',
};

export interface ContactsMenuEntry {
	id: string;
	fullName: string;
	avatar: string;
	actions: unknown[];
	subname: string;
	icon: string;
	hasEntryId: boolean;
}

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: JSON_HEADERS,
	});
}

function emptyResponse(status: number): Response {
	return new Response('', { status });
}

function acceptsHtml(request: Request): boolean {
	return (request.headers.get('accept') ?? '').toLowerCase().includes('html');
}

function unauthenticatedResponse(request: Request): Response {
	if (acceptsHtml(request)) {
		const requestUrl = new URL(request.url);
		const redirectUrl = encodeURIComponent(`${requestUrl.pathname}${requestUrl.search}`);

		return new Response(null, {
			status: 303,
			headers: {
				location: `/login?redirect_url=${redirectUrl}`,
			},
		});
	}

	return jsonResponse(401, { message: 'Current user is not logged in' });
}

function csrfFailedResponse(): Response {
	return jsonResponse(412, { message: 'CSRF check failed' });
}

function extractRequestToken(request: Request, formData?: FormData): string {
	const url = new URL(request.url);
	const queryToken = url.searchParams.get('requesttoken');

	if (queryToken) {
		return queryToken;
	}

	const headerToken = request.headers.get('requesttoken');

	if (headerToken) {
		return headerToken;
	}

	const formToken = formData?.get('requesttoken');

	return typeof formToken === 'string' ? formToken : '';
}

function enforceSession(request: Request): string | Response {
	const userId = resolveAuthenticatedUserId(request);

	if (!userId) {
		return unauthenticatedResponse(request);
	}

	return userId;
}

function enforceSessionAndCsrf(request: Request, formData?: FormData): string | Response {
	const userId = enforceSession(request);

	if (userId instanceof Response) {
		return userId;
	}

	const cookies = parseCookieHeader(request.headers.get('cookie'));
	const session = getSession(cookies[SESSION_COOKIE]);
	const token = extractRequestToken(request, formData);

	if (!isCsrfTokenValid(session?.csrfToken, token)) {
		return csrfFailedResponse();
	}

	return userId;
}

function getRequestOrigin(request: Request): string {
	const forwardedHost = request.headers.get('x-forwarded-host');
	const host = forwardedHost ?? request.headers.get('host') ?? '127.0.0.1:3100';
	const proto = request.headers.get('x-forwarded-proto') ?? 'http';

	return `${proto}://${host}`;
}

function buildAvatarUrl(origin: string, userId: string): string {
	return `${origin}/index.php/avatar/${encodeURIComponent(userId)}/64`;
}

function userToEntry(origin: string, userId: string, displayName: string): ContactsMenuEntry {
	return {
		id: userId,
		fullName: displayName,
		avatar: buildAvatarUrl(origin, userId),
		actions: [],
		subname: '',
		icon: '',
		hasEntryId: true,
	};
}

function contactsAppEnabled(): boolean {
	const value = process.env.NC_APP_CONTACTS_ENABLED?.trim().toLowerCase();

	return value !== 'false' && value !== '0';
}

function searchContacts(origin: string, userId: string, filter?: string | null): ContactsMenuEntry[] {
	const needle = (filter ?? '').toLowerCase();
	const minLength = Number.parseInt(process.env.NC_CONTACTSMENU_MIN_SEARCH_LENGTH ?? '0', 10);

	if (needle.length < minLength) {
		return [];
	}

	return getParityUsers()
		.filter((user) => user.id !== userId)
		.filter((user) => (
			needle === ''
			|| user.id.toLowerCase().includes(needle)
			|| user.displayName.toLowerCase().includes(needle)
			|| user.label.toLowerCase().includes(needle)
		))
		.map((user) => userToEntry(origin, user.id, user.displayName));
}

function getTeamMembers(teamId: string, userId: string): Record<string, string> {
	const team = findParityTeam(teamId);

	if (!team || !isTeamMember(teamId, userId)) {
		return {};
	}

	const members: Record<string, string> = {};

	for (const memberId of team.memberUserIds) {
		const member = findParityUser(memberId);
		members[memberId] = member?.displayName ?? memberId;
	}

	return members;
}

function getTeamsForUser(origin: string, userId: string): Array<{ teamId: string; displayName: string; link: string }> {
	if (!hasTeamSupport()) {
		return [];
	}

	const teams: ParityTeamFixture[] = [];
	const allTeamIds = [PARITY_TEAM_ALPHA_ID, PARITY_TEAM_BETA_ID, PARITY_TEAM_SECRET_ID];

	for (const teamId of allTeamIds) {
		const team = findParityTeam(teamId);

		if (team && team.memberUserIds.includes(userId)) {
			teams.push(team);
		}
	}

	return teams.map((team) => ({
		teamId: team.teamId,
		displayName: team.displayName,
		link: buildTeamLink(origin, team.teamId),
	}));
}

async function parseRequestPayload(request: Request): Promise<Record<string, unknown>> {
	const url = new URL(request.url);
	const payload: Record<string, unknown> = {};

	for (const [key, value] of url.searchParams.entries()) {
		if (key !== 'requesttoken') {
			payload[key] = value;
		}
	}

	const contentType = request.headers.get('content-type') ?? '';

	if (contentType.includes('application/json')) {
		const json = await request.json().catch(() => null);

		if (json && typeof json === 'object' && !Array.isArray(json)) {
			return { ...payload, ...(json as Record<string, unknown>) };
		}
	}

	const text = await request.text().catch(() => '');

	if (text) {
		for (const [key, value] of new URLSearchParams(text).entries()) {
			payload[key] = value;
		}
	}

	return payload;
}

export async function handleContactsMenuContacts(request: Request): Promise<Response> {
	const contentType = request.headers.get('content-type') ?? '';
	const formData = contentType.includes('multipart/form-data')
		? await request.formData().catch(() => null)
		: null;
	const auth = enforceSessionAndCsrf(request, formData ?? undefined);

	if (auth instanceof Response) {
		return auth;
	}

	const payload = formData
		? Object.fromEntries([...formData.entries()].map(([key, value]) => [key, typeof value === 'string' ? value : String(value)]))
		: await parseRequestPayload(request);
	const filter = typeof payload.filter === 'string' ? payload.filter : null;
	const teamId = typeof payload.teamId === 'string' ? payload.teamId : null;
	const origin = getRequestOrigin(request);

	let contacts = searchContacts(origin, auth, filter);

	if (teamId !== null) {
		const memberIds = getTeamMembers(teamId, auth);
		contacts = contacts.filter((entry) => Object.hasOwn(memberIds, entry.id));
	}

	return jsonResponse(200, {
		contacts,
		contactsAppEnabled: contactsAppEnabled(),
	});
}

export async function handleContactsMenuFindOne(request: Request): Promise<Response> {
	const payload = await parseRequestPayload(request);
	const auth = enforceSessionAndCsrf(request);

	if (auth instanceof Response) {
		return auth;
	}

	const shareTypeRaw = payload.shareType;
	const shareWith = payload.shareWith;

	if (shareTypeRaw === undefined || shareWith === undefined || shareWith === '') {
		return emptyResponse(400);
	}

	const shareType = typeof shareTypeRaw === 'number'
		? shareTypeRaw
		: Number.parseInt(String(shareTypeRaw), 10);

	if (Number.isNaN(shareType)) {
		return emptyResponse(400);
	}

	const origin = getRequestOrigin(request);
	const shareWithValue = String(shareWith);

	if (shareType === 0 || shareType === 6) {
		const user = findParityUser(shareWithValue);

		if (user && user.id !== auth) {
			return jsonResponse(200, userToEntry(origin, user.id, user.displayName));
		}
	}

	return jsonResponse(404, []);
}

export async function handleContactsMenuTeams(request: Request): Promise<Response> {
	const auth = enforceSession(request);

	if (auth instanceof Response) {
		return auth;
	}

	const origin = getRequestOrigin(request);
	const teams = getTeamsForUser(origin, auth);

	return jsonResponse(200, teams);
}

export async function handleDisplayNames(request: Request): Promise<Response> {
	const payload = await parseRequestPayload(request);
	const auth = enforceSessionAndCsrf(request);

	if (auth instanceof Response) {
		return auth;
	}

	const users = payload.users;

	if (!Array.isArray(users)) {
		return emptyResponse(400);
	}

	const result: Record<string, string> = {};

	for (const user of users) {
		const userId = String(user);
		const parityUser = findParityUser(userId);
		result[userId] = parityUser?.displayName ?? userId;
	}

	return jsonResponse(200, {
		users: result,
		status: 'success',
	});
}
