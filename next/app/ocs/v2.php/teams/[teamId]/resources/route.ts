import { handleResolveOne } from '@/src/server/teams/api';

export async function GET(
	request: Request,
	context: { params: Promise<{ teamId: string }> },
) {
	const { teamId } = await context.params;

	return handleResolveOne(request, decodeURIComponent(teamId));
}
