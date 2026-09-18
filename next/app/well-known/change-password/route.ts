import { handleWellKnown } from '@/src/server/well-known/handlers';

export async function GET(request: Request) {
	return handleWellKnown('change-password', request);
}
