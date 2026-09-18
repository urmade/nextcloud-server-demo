import { requireLoggedInUser } from '@/src/server/http/auth';
import { getPreviewByPathResponse } from '@/src/server/preview/handlers';

export async function GET(request: Request) {
	const auth = requireLoggedInUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const url = new URL(request.url);
	const file = url.searchParams.get('file') ?? '';
	const x = Number.parseInt(url.searchParams.get('x') ?? '32', 10);
	const y = Number.parseInt(url.searchParams.get('y') ?? '32', 10);
	const mimeFallback = url.searchParams.get('mimeFallback') === 'true';
	const origin = `${url.protocol}//${url.host}`;

	return getPreviewByPathResponse(file, x, y, origin, mimeFallback);
}
