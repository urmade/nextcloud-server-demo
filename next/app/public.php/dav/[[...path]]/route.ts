import { handlePublicDavRequest } from '@/src/server/dav/public-handler';

async function route(request: Request) {
	return handlePublicDavRequest(request);
}

export const GET = route;
export const HEAD = route;
export const PUT = route;
export const OPTIONS = route;
