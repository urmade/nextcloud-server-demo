import { resolveAuthenticatedUserId } from '@/src/server/ocs/auth';

export function requireLoggedInUser(request: Request): string | Response {
	const userId = resolveAuthenticatedUserId(request);

	if (!userId) {
		return new Response(JSON.stringify({ message: 'Current user is not logged in' }), {
			status: 401,
			headers: {
				'content-type': 'application/json; charset=utf-8',
			},
		});
	}

	return userId;
}
