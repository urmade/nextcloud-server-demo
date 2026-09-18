import { requireAuthenticatedUser } from '@/src/server/ocs/auth';
import { buildOcsSuccessEnvelope } from '@/src/server/ocs/envelope';
import { ocsSuccessResponse, parseOcsVersion } from '@/src/server/ocs/respond';
import {
	dispatchBeforePreferenceDeleted,
	dispatchBeforePreferenceSet,
} from '@/src/server/provisioning/preference-events';
import {
	deleteUserPreference,
	setUserPreference,
} from '@/src/server/provisioning/preference-store';

const OCS_JSON_HEADERS = {
	'content-type': 'application/json; charset=utf-8',
	'cache-control': 'no-store, no-cache, must-revalidate',
};

function ocsBadRequestEmptyDataResponse(ocsVersion: ReturnType<typeof parseOcsVersion>): Response {
	const envelope = buildOcsSuccessEnvelope([], ocsVersion);

	return Response.json(envelope, {
		status: 400,
		headers: OCS_JSON_HEADERS,
	});
}

function parseConfigKeys(search: string): string[] {
	const params = new URLSearchParams(search);

	return params.getAll('configKeys[]');
}

export async function handleSetPreference(
	request: Request,
	appId: string,
	configKey: string,
): Promise<Response> {
	const userId = requireAuthenticatedUser(request);

	if (userId instanceof Response) {
		return userId;
	}

	const ocsVersion = parseOcsVersion(request);
	let body: { configValue?: string } = {};

	try {
		body = await request.json() as { configValue?: string };
	} catch {
		body = {};
	}

	const configValue = body.configValue ?? '';
	const event = dispatchBeforePreferenceSet(userId, appId, configKey, configValue);

	if (!event.valid) {
		return ocsBadRequestEmptyDataResponse(ocsVersion);
	}

	setUserPreference(userId, appId, configKey, configValue);

	return ocsSuccessResponse([], ocsVersion);
}

export async function handleDeletePreference(
	request: Request,
	appId: string,
	configKey: string,
): Promise<Response> {
	const userId = requireAuthenticatedUser(request);

	if (userId instanceof Response) {
		return userId;
	}

	const ocsVersion = parseOcsVersion(request);
	const event = dispatchBeforePreferenceDeleted(userId, appId, configKey);

	if (!event.valid) {
		return ocsBadRequestEmptyDataResponse(ocsVersion);
	}

	deleteUserPreference(userId, appId, configKey);

	return ocsSuccessResponse([], ocsVersion);
}

export async function handleSetMultiplePreferences(
	request: Request,
	appId: string,
): Promise<Response> {
	const userId = requireAuthenticatedUser(request);

	if (userId instanceof Response) {
		return userId;
	}

	const ocsVersion = parseOcsVersion(request);
	let body: { configs?: Record<string, string> } = {};

	try {
		body = await request.json() as { configs?: Record<string, string> };
	} catch {
		body = {};
	}

	const configs = body.configs ?? {};

	for (const [configKey, configValue] of Object.entries(configs)) {
		const event = dispatchBeforePreferenceSet(userId, appId, configKey, configValue);

		if (!event.valid) {
			return ocsBadRequestEmptyDataResponse(ocsVersion);
		}
	}

	for (const [configKey, configValue] of Object.entries(configs)) {
		setUserPreference(userId, appId, configKey, configValue);
	}

	return ocsSuccessResponse([], ocsVersion);
}

export async function handleDeleteMultiplePreferences(
	request: Request,
	appId: string,
	search: string,
): Promise<Response> {
	const userId = requireAuthenticatedUser(request);

	if (userId instanceof Response) {
		return userId;
	}

	const ocsVersion = parseOcsVersion(request);
	const configKeys = parseConfigKeys(search);

	for (const configKey of configKeys) {
		const event = dispatchBeforePreferenceDeleted(userId, appId, configKey);

		if (!event.valid) {
			return ocsBadRequestEmptyDataResponse(ocsVersion);
		}
	}

	for (const configKey of configKeys) {
		deleteUserPreference(userId, appId, configKey);
	}

	return ocsSuccessResponse([], ocsVersion);
}
