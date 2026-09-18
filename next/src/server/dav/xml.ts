const NS_DAV = 'DAV:';
const NS_OC = 'http://owncloud.org/ns';
const NS_NC = 'http://nextcloud.org/ns';
const NS_SABRE = 'http://sabredav.org/ns';
const NS_CALDAV = 'urn:ietf:params:xml:ns:caldav';
const NS_CARDDAV = 'urn:ietf:params:xml:ns:carddav';
const NS_NEXTCLOUD = 'http://nextcloud.com/ns';

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

export function buildForbiddenXml(message: string): string {
	return buildSabreErrorXml('Sabre\\DAV\\Exception\\Forbidden', message);
}

export function buildBadRequestXml(message: string): string {
	return buildSabreErrorXml('Sabre\\DAV\\Exception\\BadRequest', message);
}

export function buildMethodNotAllowedXml(message: string): string {
	return buildSabreErrorXml('Sabre\\DAV\\Exception\\MethodNotAllowed', message);
}

export function buildNotAuthenticatedXml(message: string): string {
	return buildSabreErrorXml('Sabre\\DAV\\Exception\\NotAuthenticated', message);
}

export function buildPreconditionFailedXml(message: string): string {
	return buildSabreErrorXml('Sabre\\DAV\\Exception\\PreconditionFailed', message);
}

function localNameFromPropKey(key: string): { namespace: string; localName: string } | null {
	const match = /^\{([^}]+)\}(.+)$/.exec(key);

	if (!match) {
		return null;
	}

	return {
		namespace: match[1],
		localName: match[2],
	};
}

function namespacePrefix(namespace: string): string {
	switch (namespace) {
		case NS_DAV:
			return 'd';
		case NS_CALDAV:
			return 'cal';
		case NS_CARDDAV:
			return 'card';
		case NS_NEXTCLOUD:
			return 'nc';
		case NS_OC:
			return 'oc';
		default:
			return 'x';
	}
}

function renderExtraProp(key: string, value: string): string {
	const parsed = localNameFromPropKey(key);

	if (!parsed) {
		return '';
	}

	const prefix = namespacePrefix(parsed.namespace);

	return `<${prefix}:${parsed.localName}>${escapeXml(value)}</${prefix}:${parsed.localName}>`;
}

export function buildCalendarPropfindMultistatus(responses: Array<{
	href: string;
	displayName: string;
	isCollection: boolean;
	isCalendar?: boolean;
	components?: string;
	etag?: string;
	size?: number;
	contentType?: string;
}>): string {
	const parts = responses.map((entry) => {
		const resourceType = entry.isCalendar
			? `<d:resourcetype><d:collection/><cal:calendar/></d:resourcetype>`
			: entry.isCollection
				? `<d:resourcetype><d:collection/></d:resourcetype>`
				: `<d:resourcetype/>`;
		const componentSet = entry.components
			? `<cal:supported-calendar-component-set><cal:comp name="VEVENT"/><cal:comp name="VTODO"/><cal:comp name="VJOURNAL"/></cal:supported-calendar-component-set>`
			: '';
		const etag = entry.etag ? `<d:getetag>${escapeXml(entry.etag)}</d:getetag>` : '';
		const length = entry.size !== undefined ? `<d:getcontentlength>${entry.size}</d:getcontentlength>` : '';
		const contentType = entry.contentType ? `<d:getcontenttype>${escapeXml(entry.contentType)}</d:getcontenttype>` : '';

		return `<d:response>`
			+ `<d:href>${escapeXml(entry.href)}</d:href>`
			+ `<d:propstat>`
			+ `<d:prop>`
			+ resourceType
			+ `<d:displayname>${escapeXml(entry.displayName)}</d:displayname>`
			+ componentSet
			+ etag
			+ length
			+ contentType
			+ `</d:prop>`
			+ `<d:status>HTTP/1.1 200 OK</d:status>`
			+ `</d:propstat>`
			+ `</d:response>`;
	});

	return `<?xml version="1.0" encoding="utf-8"?>`
		+ `<d:multistatus xmlns:d="${NS_DAV}" xmlns:cal="${NS_CALDAV}" xmlns:oc="${NS_OC}" xmlns:nc="${NS_NC}">`
		+ parts.join('')
		+ `</d:multistatus>`;
}

export function buildCalendarReportMultistatus(entries: Array<{ href: string; etag: string }>): string {
	const parts = entries.map((entry) => `<d:response>`
		+ `<d:href>${escapeXml(entry.href)}</d:href>`
		+ `<d:propstat>`
		+ `<d:prop><d:getetag>${escapeXml(entry.etag)}</d:getetag></d:prop>`
		+ `<d:status>HTTP/1.1 200 OK</d:status>`
		+ `</d:propstat>`
		+ `</d:response>`);

	return `<?xml version="1.0" encoding="utf-8"?>`
		+ `<d:multistatus xmlns:d="${NS_DAV}" xmlns:cal="${NS_CALDAV}">`
		+ parts.join('')
		+ `</d:multistatus>`;
}

export function buildPrincipalPropfindMultistatus(responses: Array<{
	href: string;
	displayName: string;
	isCollection: boolean;
	extraProps?: Record<string, string>;
}>): string {
	const parts = responses.map((entry) => {
		const resourceType = entry.isCollection
			? `<d:resourcetype><d:collection/></d:resourcetype>`
			: `<d:resourcetype/>`;
		const extra = Object.entries(entry.extraProps ?? {})
			.map(([key, value]) => renderExtraProp(key, value))
			.join('');

		return `<d:response>`
			+ `<d:href>${escapeXml(entry.href)}</d:href>`
			+ `<d:propstat>`
			+ `<d:prop>`
			+ resourceType
			+ `<d:displayname>${escapeXml(entry.displayName)}</d:displayname>`
			+ extra
			+ `</d:prop>`
			+ `<d:status>HTTP/1.1 200 OK</d:status>`
			+ `</d:propstat>`
			+ `</d:response>`;
	});

	return `<?xml version="1.0" encoding="utf-8"?>`
		+ `<d:multistatus xmlns:d="${NS_DAV}" xmlns:cal="${NS_CALDAV}" xmlns:card="${NS_CARDDAV}" xmlns:nc="${NS_NEXTCLOUD}">`
		+ parts.join('')
		+ `</d:multistatus>`;
}
