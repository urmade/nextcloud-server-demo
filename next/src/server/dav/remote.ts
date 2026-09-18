import type { DavIngress, ParsedDavRequest } from './types';

export type { DavIngress };

export function parseDavRequest(url: URL): ParsedDavRequest | null {
	const pathname = url.pathname;

	if (pathname.startsWith('/remote.php/dav')) {
		const suffix = pathname.slice('/remote.php/dav'.length).replace(/^\//, '');

		return {
			ingress: 'v2',
			davPath: suffix,
			requestPath: pathname,
		};
	}

	if (pathname.startsWith('/remote.php/webdav')) {
		const suffix = pathname.slice('/remote.php/webdav'.length).replace(/^\//, '');

		return {
			ingress: 'legacy-webdav',
			davPath: suffix,
			requestPath: pathname,
		};
	}

	if (pathname.startsWith('/remote.php/files')) {
		const suffix = pathname.slice('/remote.php/files'.length).replace(/^\//, '');

		return {
			ingress: 'legacy-files',
			davPath: suffix,
			requestPath: pathname,
		};
	}

	if (pathname.startsWith('/remote.php/caldav')) {
		const suffix = pathname.slice('/remote.php/caldav'.length).replace(/^\//, '');

		return {
			ingress: 'legacy-caldav',
			davPath: suffix,
			requestPath: pathname,
		};
	}

	if (pathname.startsWith('/remote.php/calendar')) {
		const suffix = pathname.slice('/remote.php/calendar'.length).replace(/^\//, '');

		return {
			ingress: 'legacy-calendar',
			davPath: suffix,
			requestPath: pathname,
		};
	}

	if (pathname.startsWith('/remote.php/carddav')) {
		const suffix = pathname.slice('/remote.php/carddav'.length).replace(/^\//, '');

		return {
			ingress: 'legacy-carddav',
			davPath: suffix,
			requestPath: pathname,
		};
	}

	if (pathname.startsWith('/remote.php/contacts')) {
		const suffix = pathname.slice('/remote.php/contacts'.length).replace(/^\//, '');

		return {
			ingress: 'legacy-contacts',
			davPath: suffix,
			requestPath: pathname,
		};
	}

	return null;
}

export function isLegacyCalDavIngress(ingress: DavIngress): boolean {
	return ingress === 'legacy-caldav' || ingress === 'legacy-calendar';
}

export function isLegacyCardDavIngress(ingress: DavIngress): boolean {
	return ingress === 'legacy-carddav' || ingress === 'legacy-contacts';
}

export function ingressBasePath(ingress: DavIngress): string {
	switch (ingress) {
		case 'v2':
			return '/remote.php/dav';
		case 'legacy-webdav':
			return '/remote.php/webdav';
		case 'legacy-files':
			return '/remote.php/files';
		case 'legacy-caldav':
			return '/remote.php/caldav';
		case 'legacy-calendar':
			return '/remote.php/calendar';
		case 'legacy-carddav':
			return '/remote.php/carddav';
		case 'legacy-contacts':
			return '/remote.php/contacts';
	}
}

export function buildDavHref(requestPath: string, isCollection: boolean): string {
	if (isCollection && !requestPath.endsWith('/')) {
		return `${requestPath}/`;
	}

	return requestPath;
}

const CALENDAR_ROOTS = new Set(['calendars', 'public-calendars', 'remote-calendars', 'system-calendars']);
const ADDRESSBOOK_ROOTS = new Set(['addressbooks']);

export function isCalendarDavPath(davPath: string): boolean {
	const root = davPath.split('/').filter(Boolean)[0];

	return root !== undefined && CALENDAR_ROOTS.has(root);
}

export function isAddressBookDavPath(davPath: string): boolean {
	const root = davPath.split('/').filter(Boolean)[0];

	return root !== undefined && ADDRESSBOOK_ROOTS.has(root);
}

export function isPublicCalendarDavPath(davPath: string): boolean {
	return davPath === 'public-calendars' || davPath.startsWith('public-calendars/');
}
