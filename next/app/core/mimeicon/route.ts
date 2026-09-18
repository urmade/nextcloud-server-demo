import { getMimeIconRedirect } from '@/src/server/preview/handlers';

export async function GET(request: Request) {
	const url = new URL(request.url);
	const mime = url.searchParams.get('mime') ?? 'application/octet-stream';
	const origin = `${url.protocol}//${url.host}`;

	return getMimeIconRedirect(mime, origin);
}
