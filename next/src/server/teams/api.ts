import { ProviderNotFoundError, listTeamsForResource, resolveTeamResources } from '@/src/server/teams/store';
import { requireAuthenticatedUser } from '@/src/server/ocs/auth';
import {
	ocsFailureResponse,
	ocsSuccessResponse,
	parseOcsVersion,
} from '@/src/server/ocs/respond';

function getRequestOrigin(request: Request): string {
	const forwardedHost = request.headers.get('x-forwarded-host');
	const host = forwardedHost ?? request.headers.get('host') ?? '127.0.0.1:3100';
	const proto = request.headers.get('x-forwarded-proto') ?? 'http';

	return `${proto}://${host}`;
}

export function handleListTeams(
	request: Request,
	providerId: string,
	resourceId: string,
): Response {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const ocsVersion = parseOcsVersion(request);

	try {
		return ocsSuccessResponse(
			{
				teams: listTeamsForResource(getRequestOrigin(request), auth, providerId, resourceId),
			},
			ocsVersion,
		);
	} catch (error) {
		if (error instanceof ProviderNotFoundError) {
			return ocsFailureResponse(ocsVersion, 996, error.message);
		}

		return ocsFailureResponse(ocsVersion, 996, '');
	}
}

export function handleResolveOne(request: Request, teamId: string): Response {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const ocsVersion = parseOcsVersion(request);

	return ocsSuccessResponse(
		{
			resources: resolveTeamResources(getRequestOrigin(request), auth, teamId),
		},
		ocsVersion,
	);
}
