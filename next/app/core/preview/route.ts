import { requireLoggedInUser } from '@/src/server/http/auth';
import { getPreviewByFileIdResponse } from '@/src/server/preview/handlers';

export async function GET(request: Request) {
	const auth = requireLoggedInUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const url = new URL(request.url);
	const fileId = Number.parseInt(url.searchParams.get('fileId') ?? '', 10);
	const x = Number.parseInt(url.searchParams.get('x') ?? '32', 10);
	const y = Number.parseInt(url.searchParams.get('y') ?? '32', 10);
	const mimeFallback = url.searchParams.get('mimeFallback') === 'true';
	const origin = `${url.protocol}//${url.host}`;

	if (Number.isNaN(fileId)) {
		return getPreviewByFileIdResponse(0, x, y, origin, mimeFallback);
	}

	return getPreviewByFileIdResponse(fileId, x, y, origin, mimeFallback);
}
