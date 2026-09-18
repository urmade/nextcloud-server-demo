import { isValidBasicAuth, parseBasicAuthHeader } from '@/src/server/auth/basic';
import { getCapabilitiesDocument } from '@/src/server/ocs/capabilities';
import { buildOcsSuccessEnvelope, type OcsApiVersion, type OcsEnvelope } from '@/src/server/ocs/envelope';

const OCS_JSON_HEADERS = {
	'content-type': 'application/json; charset=utf-8',
	'cache-control': 'no-store, no-cache, must-revalidate',
};

export function wantsJsonResponse(request: Request): boolean {
	const url = new URL(request.url);

	return url.searchParams.get('format') === 'json';
}

function escapeXml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}

function renderCapabilitiesXml(envelope: OcsEnvelope<ReturnType<typeof getCapabilitiesDocument>>): string {
	const { meta, data } = envelope.ocs;
	const core = data.capabilities.core;

	return `<?xml version="1.0"?>
<ocs>
 <meta>
  <status>${escapeXml(meta.status)}</status>
  <statuscode>${meta.statuscode}</statuscode>
  <message>${escapeXml(meta.message)}</message>
  ${meta.totalitems !== undefined ? `<totalitems>${escapeXml(meta.totalitems)}</totalitems>` : ''}
  ${meta.itemsperpage !== undefined ? `<itemsperpage>${escapeXml(meta.itemsperpage)}</itemsperpage>` : ''}
 </meta>
 <data>
  <version>
   <major>${data.version.major}</major>
   <minor>${data.version.minor}</minor>
   <micro>${data.version.micro}</micro>
   <string>${escapeXml(data.version.string)}</string>
   <edition>${escapeXml(data.version.edition)}</edition>
   <extendedSupport>${data.version.extendedSupport ? '1' : '0'}</extendedSupport>
  </version>
  <capabilities>
   <core>
    <pollinterval>${core.pollinterval}</pollinterval>
    <webdav-root>${escapeXml(core['webdav-root'])}</webdav-root>
    <reference-api>${core['reference-api'] ? '1' : '0'}</reference-api>
    <reference-regex>${escapeXml(core['reference-regex'])}</reference-regex>
    <mod-rewrite-working>${core['mod-rewrite-working'] ? '1' : '0'}</mod-rewrite-working>
   </core>
  </capabilities>
 </data>
</ocs>
`;
}

export function handleCapabilitiesGet(request: Request, ocsVersion: OcsApiVersion): Response {
	const credentials = parseBasicAuthHeader(request.headers.get('authorization'));
	const authenticated = isValidBasicAuth(credentials);
	const envelope = buildOcsSuccessEnvelope(getCapabilitiesDocument(authenticated), ocsVersion);

	if (wantsJsonResponse(request)) {
		return Response.json(envelope, {
			status: 200,
			headers: OCS_JSON_HEADERS,
		});
	}

	return new Response(renderCapabilitiesXml(envelope), {
		status: 200,
		headers: {
			'content-type': 'application/xml; charset=utf-8',
			'cache-control': 'no-store, no-cache, must-revalidate',
		},
	});
}
