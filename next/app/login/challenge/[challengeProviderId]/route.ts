import { resolveSession } from '@/src/server/auth/session';
import {
	handleShowChallengeGet,
	handleSolveChallengePost,
} from '@/src/server/auth/two-factor-challenge';

export async function GET(
	request: Request,
	context: { params: Promise<{ challengeProviderId: string }> },
) {
	const { challengeProviderId } = await context.params;

	return handleShowChallengeGet(request, resolveSession(request), challengeProviderId);
}

export async function POST(
	request: Request,
	context: { params: Promise<{ challengeProviderId: string }> },
) {
	const { challengeProviderId } = await context.params;
	const body = await request.text();

	return handleSolveChallengePost(request, resolveSession(request), challengeProviderId, body);
}
