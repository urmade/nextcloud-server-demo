import { handleListTeams } from '@/src/server/teams/api';

export async function GET(
	request: Request,
	context: { params: Promise<{ providerId: string; resourceId: string }> },
) {
	const { providerId, resourceId } = await context.params;

	return handleListTeams(
		request,
		decodeURIComponent(providerId),
		decodeURIComponent(resourceId),
	);
}
