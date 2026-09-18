export const PARITY_DECK_PROVIDER_ID = 'parity-deck';
export const PARITY_BOARD_ID = 'board-1';
export const PARITY_BOARD_EMPTY_ID = 'board-empty';
export const PARITY_TEAM_ALPHA_ID = 'parity-team-alpha';
export const PARITY_TEAM_BETA_ID = 'parity-team-beta';
export const PARITY_TEAM_SECRET_ID = 'parity-team-secret';

export interface ParityTeamFixture {
	teamId: string;
	displayName: string;
	memberUserIds: string[];
}

export interface ParityTeamResourceFixture {
	providerId: string;
	resourceId: string;
	label: string;
	teamIds: string[];
	iconEmoji: string | null;
}

const PARITY_TEAMS: ParityTeamFixture[] = [
	{
		teamId: PARITY_TEAM_ALPHA_ID,
		displayName: 'Parity Team Alpha',
		memberUserIds: ['admin', 'alice'],
	},
	{
		teamId: PARITY_TEAM_BETA_ID,
		displayName: 'Parity Team Beta',
		memberUserIds: ['admin'],
	},
	{
		teamId: PARITY_TEAM_SECRET_ID,
		displayName: 'Secret Team',
		memberUserIds: ['alice'],
	},
];

const PARITY_TEAM_RESOURCES: ParityTeamResourceFixture[] = [
	{
		providerId: PARITY_DECK_PROVIDER_ID,
		resourceId: PARITY_BOARD_ID,
		label: 'Parity Board',
		teamIds: [PARITY_TEAM_ALPHA_ID, PARITY_TEAM_BETA_ID],
		iconEmoji: '📋',
	},
];

export function isTeamsProviderEnabled(): boolean {
	const value = process.env.NC_PARITY_TEAMS_PROVIDER?.trim().toLowerCase();

	return value !== 'false' && value !== '0';
}

export function hasTeamSupport(): boolean {
	return isTeamsProviderEnabled();
}

export function getParityTeamProviderIds(): string[] {
	if (!hasTeamSupport()) {
		return [];
	}

	return [PARITY_DECK_PROVIDER_ID];
}

export function findParityTeam(teamId: string): ParityTeamFixture | null {
	if (!hasTeamSupport()) {
		return null;
	}

	return PARITY_TEAMS.find((team) => team.teamId === teamId) ?? null;
}

export function isTeamMember(teamId: string, userId: string): boolean {
	const team = findParityTeam(teamId);

	if (!team) {
		return false;
	}

	return team.memberUserIds.includes(userId);
}

export function getParityTeamResourcesForProvider(
	providerId: string,
	resourceId: string,
): ParityTeamResourceFixture[] {
	if (!hasTeamSupport()) {
		return [];
	}

	return PARITY_TEAM_RESOURCES.filter(
		(resource) => resource.providerId === providerId && resource.resourceId === resourceId,
	);
}

export function getParityTeamResourcesForTeam(teamId: string): ParityTeamResourceFixture[] {
	if (!hasTeamSupport()) {
		return [];
	}

	return PARITY_TEAM_RESOURCES.filter((resource) => resource.teamIds.includes(teamId));
}

export function getParityTeamProvider(providerId: string): TeamProviderDefinition | null {
	if (!hasTeamSupport()) {
		return null;
	}

	if (providerId === PARITY_DECK_PROVIDER_ID) {
		return PARITY_DECK_PROVIDER;
	}

	return null;
}

export interface TeamProviderDefinition {
	id: string;
	name: string;
	icon: string;
}

const PARITY_DECK_PROVIDER: TeamProviderDefinition = {
	id: PARITY_DECK_PROVIDER_ID,
	name: 'Parity Deck',
	icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M2 2h12v12H2z"/></svg>',
};

export function buildTeamLink(origin: string, teamId: string): string {
	return `${origin}/index.php/apps/contacts/direct/circle/${teamId}`;
}

export function buildTeamResourceUrl(origin: string, providerId: string, resourceId: string): string {
	return `${origin}/parity/${providerId}/${resourceId}`;
}
