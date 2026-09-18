import {
	buildOcsFailureEnvelope,
	buildOcsSuccessEnvelope,
	getOcsHttpStatus,
	type OcsApiVersion,
} from '@/src/server/ocs/envelope';

const OCS_JSON_HEADERS = {
	'content-type': 'application/json; charset=utf-8',
	'cache-control': 'no-store, no-cache, must-revalidate',
};

export function parseOcsVersion(request: Request): OcsApiVersion {
	return new URL(request.url).pathname.includes('/ocs/v1.php/') ? 1 : 2;
}

export function ocsUnauthorizedResponse(ocsVersion: OcsApiVersion): Response {
	const envelope = buildOcsFailureEnvelope(ocsVersion, 997, '');

	return Response.json(envelope, {
		status: getOcsHttpStatus(ocsVersion, 997),
		headers: OCS_JSON_HEADERS,
	});
}

export function ocsForbiddenResponse(
	ocsVersion: OcsApiVersion,
	message = '',
	data: Record<string, never> | unknown[] = {},
	extraHeaders: Record<string, string> = {},
): Response {
	const envelope = {
		ocs: {
			meta: {
				status: 'failure' as const,
				statuscode: 403,
				message,
				...(ocsVersion === 1 ? { totalitems: '', itemsperpage: '' } : {}),
			},
			data,
		},
	};

	return Response.json(envelope, {
		status: getOcsHttpStatus(ocsVersion, 403),
		headers: {
			...OCS_JSON_HEADERS,
			...extraHeaders,
		},
	});
}

export function ocsFailureResponse(
	ocsVersion: OcsApiVersion,
	statuscode: number,
	message = '',
	data: Record<string, never> | unknown[] = {},
): Response {
	const envelope = {
		ocs: {
			meta: {
				status: 'failure' as const,
				statuscode,
				message,
				...(ocsVersion === 1 ? { totalitems: '', itemsperpage: '' } : {}),
			},
			data,
		},
	};

	return Response.json(envelope, {
		status: getOcsHttpStatus(ocsVersion, statuscode),
		headers: OCS_JSON_HEADERS,
	});
}

export function ocsSuccessResponse<TData>(
	data: TData,
	ocsVersion: OcsApiVersion,
	extraHeaders: Record<string, string> = {},
): Response {
	const envelope = buildOcsSuccessEnvelope(data, ocsVersion);

	return Response.json(envelope, {
		status: 200,
		headers: {
			...OCS_JSON_HEADERS,
			...extraHeaders,
		},
	});
}

export function ocsNotModifiedResponse(): Response {
	return new Response(null, {
		status: 304,
	});
}
