export type DavIngress = 'v2' | 'legacy-webdav' | 'legacy-files';

export interface ParsedDavRequest {
	ingress: DavIngress;
	davPath: string;
	requestPath: string;
}

export interface DavFileNode {
	name: string;
	kind: 'file' | 'directory';
	fileId: number;
	etag: string;
	size: number;
	contentType: string;
	content?: string;
	children?: DavFileNode[];
}

export interface DavPropfindEntry {
	href: string;
	props: Record<string, string | null>;
	isCollection: boolean;
}
