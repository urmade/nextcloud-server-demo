import {
	buildTeamLink,
	buildTeamResourceUrl,
	findParityTeam,
	getParityTeamProvider,
	getParityTeamResourcesForProvider,
	getParityTeamResourcesForTeam,
	hasTeamSupport,
	isTeamMember,
	type ParityTeamResourceFixture,
	type TeamProviderDefinition,
} from '@/src/server/teams/catalog';
import type {
	TeamPayload,
	TeamResourcePayload,
	TeamWithResourcesPayload,
} from '@/src/server/teams/types';

export class ProviderNotFoundError extends Error {
	constructor(public readonly providerId: string) {
		super(`No provider found for id ${providerId}`);
		this.name = 'ProviderNotFoundError';
	}
}

function requireProvider(providerId: string): TeamProviderDefinition {
	const provider = getParityTeamProvider(providerId);

	if (!provider) {
		throw new ProviderNotFoundError(providerId);
	}

	return provider;
}

function serializeResource(
	origin: string,
	fixture: ParityTeamResourceFixture,
	provider: TeamProviderDefinition,
): TeamResourcePayload {
	return {
		id: fixture.resourceId,
		label: fixture.label,
		url: buildTeamResourceUrl(origin, fixture.providerId, fixture.resourceId),
		iconSvg: null,
		iconURL: null,
		iconEmoji: fixture.iconEmoji,
		provider: {
			id: provider.id,
			name: provider.name,
			icon: provider.icon,
		},
	};
}

function serializeTeam(origin: string, teamId: string, displayName: string): TeamPayload {
	return {
		teamId,
		displayName,
		link: buildTeamLink(origin, teamId),
	};
}

export function listTeamsForResource(
	origin: string,
	userId: string,
	providerId: string,
	resourceId: string,
): TeamWithResourcesPayload[] {
	if (!hasTeamSupport()) {
		return [];
	}

	requireProvider(providerId);

	const fixtures = getParityTeamResourcesForProvider(providerId, resourceId);
	const provider = requireProvider(providerId);
	const teamIds = new Set<string>();

	for (const fixture of fixtures) {
		for (const teamId of fixture.teamIds) {
			if (isTeamMember(teamId, userId)) {
				teamIds.add(teamId);
			}
		}
	}

	const sharesPerTeam = getSharedWithList([...teamIds], userId, resourceId, provider);

	return [...teamIds]
		.map((teamId) => {
			const team = findParityTeam(teamId);

			if (!team) {
				return null;
			}

			return {
				...serializeTeam(origin, team.teamId, team.displayName),
				resources: sharesPerTeam[teamId] ?? [],
			};
		})
		.filter((team): team is TeamWithResourcesPayload => team !== null);
}

export function resolveTeamResources(
	origin: string,
	userId: string,
	teamId: string,
): TeamResourcePayload[] {
	if (!hasTeamSupport() || !isTeamMember(teamId, userId)) {
		return [];
	}

	const fixtures = getParityTeamResourcesForTeam(teamId);
	const providers = new Map<string, TeamProviderDefinition>();

	return fixtures.map((fixture) => {
		let provider = providers.get(fixture.providerId);

		if (!provider) {
			provider = requireProvider(fixture.providerId);
			providers.set(fixture.providerId, provider);
		}

		return serializeResource(origin, fixture, provider);
	});
}

function getSharedWithList(
	teamIds: string[],
	userId: string,
	resourceId: string,
	provider: TeamProviderDefinition,
): Record<string, TeamResourcePayload[]> {
	const result: Record<string, TeamResourcePayload[]> = {};

	for (const teamId of teamIds) {
		if (!isTeamMember(teamId, userId)) {
			continue;
		}

		result[teamId] = getParityTeamResourcesForTeam(teamId)
			.filter((fixture) => fixture.resourceId === resourceId && fixture.providerId === provider.id)
			.map((fixture) => serializeResource(origin, fixture, provider));
	}

	return result;
}
