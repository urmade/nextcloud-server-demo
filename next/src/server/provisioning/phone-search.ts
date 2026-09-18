import { requireAuthenticatedUser } from '@/src/server/ocs/auth';
import { buildOcsSuccessEnvelope } from '@/src/server/ocs/envelope';
import { ocsSuccessResponse, parseOcsVersion } from '@/src/server/ocs/respond';
import { getDefaultPhoneRegion } from '@/src/server/provisioning/config';
import { deleteKnownTo, storeIsKnownToUser } from '@/src/server/provisioning/known-users';
import { convertToStandardFormat, getCountryCodeForRegion } from '@/src/server/provisioning/phone-util';
import { searchUsersByPhone } from '@/src/server/provisioning/store';

const OCS_JSON_HEADERS = {
	'content-type': 'application/json; charset=utf-8',
	'cache-control': 'no-store, no-cache, must-revalidate',
};

function getCloudHost(request: Request): string {
	const forwardedHost = request.headers.get('x-forwarded-host');
	const host = forwardedHost ?? request.headers.get('host') ?? '127.0.0.1:3100';

	return host.split(',')[0]?.trim() ?? '127.0.0.1:3100';
}

function ocsBadRequestEmptyDataResponse(ocsVersion: ReturnType<typeof parseOcsVersion>): Response {
	const envelope = buildOcsSuccessEnvelope([], ocsVersion);

	return Response.json(envelope, {
		status: 400,
		headers: OCS_JSON_HEADERS,
	});
}

export async function handleSearchByPhoneNumbers(request: Request): Promise<Response> {
	const caller = requireAuthenticatedUser(request);

	if (caller instanceof Response) {
		return caller;
	}

	const ocsVersion = parseOcsVersion(request);
	let body: { location?: string; search?: Record<string, string[]> } = {};

	try {
		body = await request.json() as { location?: string; search?: Record<string, string[]> };
	} catch {
		body = {};
	}

	const location = body.location ?? '';
	const search = body.search ?? {};

	if (getCountryCodeForRegion(location) === null) {
		return ocsBadRequestEmptyDataResponse(ocsVersion);
	}

	const defaultPhoneRegion = getDefaultPhoneRegion();
	const normalizedNumberToKey: Record<string, string> = {};

	for (const [key, phoneNumbers] of Object.entries(search)) {
		for (const phone of phoneNumbers) {
			const normalizedNumber = convertToStandardFormat(phone, location);

			if (normalizedNumber !== null) {
				normalizedNumberToKey[normalizedNumber] = key;
			}

			if (defaultPhoneRegion !== '' && defaultPhoneRegion !== location && phone.startsWith('0')) {
				const fallbackNumber = convertToStandardFormat(phone, defaultPhoneRegion);

				if (fallbackNumber !== null) {
					normalizedNumberToKey[fallbackNumber] = key;
				}
			}
		}
	}

	const phoneNumbers = Object.keys(normalizedNumberToKey);

	if (phoneNumbers.length === 0) {
		return ocsSuccessResponse([], ocsVersion);
	}

	deleteKnownTo(caller);

	const userMatches = searchUsersByPhone(phoneNumbers);

	if (Object.keys(userMatches).length === 0) {
		return ocsSuccessResponse([], ocsVersion);
	}

	const cloudHost = getCloudHost(request);
	const matches: Record<string, string> = {};

	for (const [phone, userId] of Object.entries(userMatches)) {
		const searchKey = normalizedNumberToKey[phone];

		if (!searchKey) {
			continue;
		}

		matches[searchKey] = `${userId}@${cloudHost}`;
		storeIsKnownToUser(caller, userId);
	}

	return ocsSuccessResponse(matches, ocsVersion);
}
