import { requireFilenamesAdminOcs } from './filenames-auth';
import {
	getSanitizationStatus,
	isFilenameSanitizationRunning,
	scheduleSanitization,
	setFilesWindowsSupport,
	stopSanitizationJob,
} from './filenames-store';
import {
	ocsFailureResponse,
	ocsSuccessResponse,
	parseOcsVersion,
} from '@/src/server/ocs/respond';

const LIMIT_INVALID_MESSAGE = 'Limit must be a positive integer.';
const REPLACEMENT_INVALID_MESSAGE = 'The replacement character may only be a single character.';
const ALREADY_STARTED_MESSAGE = 'Filename sanitization already started.';
const NOT_RUNNING_MESSAGE = 'No filename sanitization in progress.';

function parseJsonBody<T>(request: Request): Promise<T | null> {
	return request.json().catch(() => null);
}

export function handleFilenamesGetStatus(request: Request): Response {
	const ocsVersion = parseOcsVersion(request);
	const admin = requireFilenamesAdminOcs(request);

	if (admin instanceof Response) {
		return admin;
	}

	return ocsSuccessResponse(getSanitizationStatus(), ocsVersion);
}

export async function handleFilenamesSanitize(request: Request): Promise<Response> {
	const ocsVersion = parseOcsVersion(request);
	const body = await parseJsonBody<{ limit?: number | null; charReplacement?: string | null }>(request);
	const admin = requireFilenamesAdminOcs(request, body ?? undefined);

	if (admin instanceof Response) {
		return admin;
	}

	const limit = body?.limit ?? 10;
	const charReplacement = body?.charReplacement ?? null;

	if (limit < 1) {
		return ocsFailureResponse(ocsVersion, 400, LIMIT_INVALID_MESSAGE, []);
	}

	if (charReplacement !== null && (charReplacement === '' || charReplacement.length > 1)) {
		return ocsFailureResponse(ocsVersion, 400, REPLACEMENT_INVALID_MESSAGE, []);
	}

	if (isFilenameSanitizationRunning()) {
		return ocsFailureResponse(ocsVersion, 400, ALREADY_STARTED_MESSAGE, []);
	}

	scheduleSanitization(limit, charReplacement);

	return ocsSuccessResponse([], ocsVersion);
}

export function handleFilenamesStopSanitization(request: Request): Response {
	const ocsVersion = parseOcsVersion(request);
	const admin = requireFilenamesAdminOcs(request);

	if (admin instanceof Response) {
		return admin;
	}

	if (!isFilenameSanitizationRunning()) {
		return ocsFailureResponse(ocsVersion, 400, NOT_RUNNING_MESSAGE, []);
	}

	stopSanitizationJob();

	return ocsSuccessResponse([], ocsVersion);
}

export async function handleFilenamesToggleWindowsSupport(request: Request): Promise<Response> {
	const ocsVersion = parseOcsVersion(request);
	const body = await parseJsonBody<{ enabled?: boolean }>(request);
	const admin = requireFilenamesAdminOcs(request, body ?? undefined);

	if (admin instanceof Response) {
		return admin;
	}

	const enabled = Boolean(body?.enabled);

	setFilesWindowsSupport(enabled);

	return ocsSuccessResponse({ enabled }, ocsVersion);
}
