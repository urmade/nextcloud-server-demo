import type { DavIngress, ParsedDavRequest } from './types';

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

	return null;
}

export function ingressBasePath(ingress: DavIngress): string {
	switch (ingress) {
		case 'v2':
			return '/remote.php/dav';
		case 'legacy-webdav':
			return '/remote.php/webdav';
		case 'legacy-files':
			return '/remote.php/files';
	}
}

export function buildDavHref(requestPath: string, isCollection: boolean): string {
	if (isCollection && !requestPath.endsWith('/')) {
		return `${requestPath}/`;
	}

	return requestPath;
}
