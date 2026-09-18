import { NextResponse, type NextRequest } from 'next/server';
import { handleDavRequest } from '@/src/server/dav/handler';
import { handlePublicDavRequest } from '@/src/server/dav/public-handler';

const DAV_METHODS = new Set([
	'PROPFIND',
	'OPTIONS',
	'MKCOL',
	'PUT',
	'MOVE',
]);

const PUBLIC_DAV_METHODS = new Set([
	'PROPFIND',
]);

function isDavRemotePath(pathname: string): boolean {
	return pathname.startsWith('/remote.php/dav')
		|| pathname.startsWith('/remote.php/webdav')
		|| pathname.startsWith('/remote.php/files');
}

function isPublicDavPath(pathname: string): boolean {
	return pathname.startsWith('/public.php/dav')
		|| pathname.startsWith('/public.php/webdav');
}

export async function middleware(request: NextRequest) {
	const pathname = request.nextUrl.pathname;
	const method = request.method.toUpperCase();

	if (isPublicDavPath(pathname)) {
		if (!PUBLIC_DAV_METHODS.has(method)) {
			return NextResponse.next();
		}

		return handlePublicDavRequest(request);
	}

	if (!isDavRemotePath(pathname)) {
		return NextResponse.next();
	}

	if (!DAV_METHODS.has(method)) {
		return NextResponse.next();
	}

	return handleDavRequest(request);
}

export const config = {
	runtime: 'nodejs',
	matcher: [
		'/remote.php/dav/:path*',
		'/remote.php/webdav/:path*',
		'/remote.php/files/:path*',
		'/public.php/dav/:path*',
		'/public.php/webdav/:path*',
	],
};
