const NS_DAV = 'DAV:';
const NS_OC = 'http://owncloud.org/ns';
const NS_NC = 'http://nextcloud.org/ns';
const NS_SABRE = 'http://sabredav.org/ns';

function escapeXml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

export function buildSabreErrorXml(exception: string, message: string): string {
	return `<?xml version="1.0" encoding="utf-8"?>`
		+ `<d:error xmlns:d="${NS_DAV}" xmlns:s="${NS_SABRE}">`
		+ `<s:exception>${escapeXml(exception)}</s:exception>`
		+ `<s:message>${escapeXml(message)}</s:message>`
		+ `</d:error>`;
}

export function buildPropfindMultistatus(responses: Array<{
	href: string;
	isCollection: boolean;
	displayName: string;
	etag: string;
	fileId: number;
	size: number;
	permissions: string;
}>): string {
	const parts = responses.map((entry) => {
		const resourceType = entry.isCollection
			? `<d:resourcetype><d:collection/></d:resourcetype>`
			: `<d:resourcetype/>`;

		return `<d:response>`
			+ `<d:href>${escapeXml(entry.href)}</d:href>`
			+ `<d:propstat>`
			+ `<d:prop>`
			+ resourceType
			+ `<d:displayname>${escapeXml(entry.displayName)}</d:displayname>`
			+ `<d:getetag>${escapeXml(entry.etag)}</d:getetag>`
			+ `<d:getcontentlength>${entry.size}</d:getcontentlength>`
			+ `<oc:fileid>${entry.fileId}</oc:fileid>`
			+ `<oc:id>${entry.fileId}</oc:id>`
			+ `<oc:permissions>${escapeXml(entry.permissions)}</oc:permissions>`
			+ `<oc:size>${entry.size}</oc:size>`
			+ `</d:prop>`
			+ `<d:status>HTTP/1.1 200 OK</d:status>`
			+ `</d:propstat>`
			+ `</d:response>`;
	});

	return `<?xml version="1.0" encoding="utf-8"?>`
		+ `<d:multistatus xmlns:d="${NS_DAV}" xmlns:oc="${NS_OC}" xmlns:nc="${NS_NC}">`
		+ parts.join('')
		+ `</d:multistatus>`;
}

export function buildNotFoundXml(message: string): string {
	return buildSabreErrorXml('Sabre\\DAV\\Exception\\NotFound', message);
}
