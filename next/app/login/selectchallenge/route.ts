import { resolveSession } from '@/src/server/auth/session';
import { handleSelectChallengeGet } from '@/src/server/auth/two-factor-challenge';

export async function GET(request: Request) {
	return handleSelectChallengeGet(request, resolveSession(request));
}
