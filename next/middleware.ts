import { NextResponse, type NextRequest } from 'next/server';
import { handleDavRequest } from '@/src/server/dav/handler';

const DAV_METHODS = new Set([
	'PROPFIND',
	'OPTIONS',
	'MKCOL',
	'PUT',
	'MOVE',
]);

function isDavRemotePath(pathname: string): boolean {
	return pathname.startsWith('/remote.php/dav')
		|| pathname.startsWith('/remote.php/webdav')
		|| pathname.startsWith('/remote.php/files');
}

export async function middleware(request: NextRequest) {
	if (!isDavRemotePath(request.nextUrl.pathname)) {
		return NextResponse.next();
	}

	if (!DAV_METHODS.has(request.method.toUpperCase())) {
		return NextResponse.next();
	}

	return handleDavRequest(request);
}

export const config = {
	matcher: [
		'/remote.php/dav/:path*',
		'/remote.php/webdav/:path*',
		'/remote.php/files/:path*',
	],
};
