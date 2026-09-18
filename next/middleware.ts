import { NextResponse, type NextRequest } from 'next/server';
import { handleDavRequest } from '@/src/server/dav/handler';
import { handlePublicDavRequest } from '@/src/server/dav/public-handler';
import {
	isAddressBookDavPath,
	isCalendarDavPath,
	isLegacyCalDavIngress,
	isLegacyCardDavIngress,
	isPublicCalendarDavPath,
	parseDavRequest,
} from '@/src/server/dav/remote';
import { isTreeExtrasDavPath } from '@/src/server/dav/tree-extras';

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
		|| pathname.startsWith('/remote.php/files')
		|| pathname.startsWith('/remote.php/caldav')
		|| pathname.startsWith('/remote.php/calendar')
		|| pathname.startsWith('/remote.php/carddav')
		|| pathname.startsWith('/remote.php/contacts');
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

	const parsed = parseDavRequest(new URL(pathname, 'http://localhost'));
	const davPath = parsed?.davPath ?? null;
	const isCalendarPath = parsed !== null
		&& (isLegacyCalDavIngress(parsed.ingress)
			|| (parsed.ingress === 'v2' && (isCalendarDavPath(davPath ?? '') || isPublicCalendarDavPath(davPath ?? ''))));
	const isAddressBookPath = parsed !== null
		&& (isLegacyCardDavIngress(parsed.ingress)
			|| (parsed.ingress === 'v2' && isAddressBookDavPath(davPath ?? '')));
	const isTreeExtrasPath = parsed !== null
		&& parsed.ingress === 'v2'
		&& isTreeExtrasDavPath(davPath ?? '');
	const allowedMethods = isCalendarPath
		? new Set([...DAV_METHODS, 'GET', 'HEAD', 'DELETE', 'MKCALENDAR', 'REPORT'])
		: isAddressBookPath || isTreeExtrasPath
			? new Set([...DAV_METHODS, 'GET', 'HEAD', 'DELETE', 'PUT', 'REPORT'])
			: DAV_METHODS;

	if (!allowedMethods.has(method)) {
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
		'/remote.php/caldav/:path*',
		'/remote.php/calendar/:path*',
		'/remote.php/carddav/:path*',
		'/remote.php/contacts/:path*',
		'/public.php/dav/:path*',
		'/public.php/webdav/:path*',
	],
};
