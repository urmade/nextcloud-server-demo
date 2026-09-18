export type PublicDavIngress = 'v2' | 'legacy-webdav';

export interface ParsedPublicDavRequest {
	ingress: PublicDavIngress;
	davPath: string;
	requestPath: string;
}

export function parsePublicDavRequest(url: URL): ParsedPublicDavRequest | null {
	const pathname = url.pathname;

	if (pathname.startsWith('/public.php/dav')) {
		const suffix = pathname.slice('/public.php/dav'.length).replace(/^\//, '');

		return {
			ingress: 'v2',
			davPath: suffix,
			requestPath: pathname,
		};
	}

	if (pathname.startsWith('/public.php/webdav')) {
		const suffix = pathname.slice('/public.php/webdav'.length).replace(/^\//, '');

		return {
			ingress: 'legacy-webdav',
			davPath: suffix,
			requestPath: pathname,
		};
	}

	return null;
}

export function publicIngressBasePath(ingress: PublicDavIngress): string {
	return ingress === 'v2' ? '/public.php/dav' : '/public.php/webdav';
}

export function extractV2Token(davPath: string): string | 'invalid-path' {
	const segments = davPath.split('/').filter(Boolean);

	if (segments.length < 2 || segments[0] !== 'files' || segments[1] === '') {
		return 'invalid-path';
	}

	return segments[1];
}

export function extractV2RelativeSegments(davPath: string): string[] {
	const segments = davPath.split('/').filter(Boolean);

	if (segments.length < 2 || segments[0] !== 'files') {
		return [];
	}

	return segments.slice(2);
}
