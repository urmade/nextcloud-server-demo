import { findParityUser } from '@/src/server/config/users';
import { requireAuthenticatedUser, resolveAuthenticatedUserId } from '@/src/server/ocs/auth';
import {
	ocsFailureResponse,
	ocsNotFoundNullResponse,
	ocsSuccessResponse,
	ocsUnauthorizedResponse,
	parseOcsVersion,
} from '@/src/server/ocs/respond';
import {
	clearAbsence,
	createOrUpdateAbsence,
	getAbsence,
	getCurrentAbsence,
	toConfiguredOutOfOfficeData,
} from './out-of-office-store';

function parseSetOutOfOfficeBody(body: unknown): {
	firstDay: string;
	lastDay: string;
	status: string;
	message: string;
	replacementUserId: string | null;
} | null {
	if (!body || typeof body !== 'object') {
		return null;
	}

	const record = body as Record<string, unknown>;

	if (
		typeof record.firstDay !== 'string'
		|| typeof record.lastDay !== 'string'
		|| typeof record.status !== 'string'
		|| typeof record.message !== 'string'
	) {
		return null;
	}

	const replacementUserId = record.replacementUserId === undefined || record.replacementUserId === null
		? null
		: String(record.replacementUserId);

	return {
		firstDay: record.firstDay,
		lastDay: record.lastDay,
		status: record.status,
		message: record.message,
		replacementUserId,
	};
}

export function handleGetCurrentOutOfOfficeData(request: Request, userId: string): Response {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const ocsVersion = parseOcsVersion(request);

	if (!findParityUser(userId)) {
		return ocsNotFoundNullResponse(ocsVersion);
	}

	const data = getCurrentAbsence(userId);

	if (!data) {
		return ocsNotFoundNullResponse(ocsVersion);
	}

	return ocsSuccessResponse(data, ocsVersion);
}

export function handleGetOutOfOffice(request: Request, userId: string): Response {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const ocsVersion = parseOcsVersion(request);
	const absence = getAbsence(userId);

	if (!absence) {
		return ocsNotFoundNullResponse(ocsVersion);
	}

	return ocsSuccessResponse(toConfiguredOutOfOfficeData(absence), ocsVersion);
}

export async function handleSetOutOfOffice(request: Request): Promise<Response> {
	const ocsVersion = parseOcsVersion(request);
	const sessionUserId = resolveAuthenticatedUserId(request);

	if (!sessionUserId) {
		return ocsUnauthorizedResponse(ocsVersion);
	}

	const body = parseSetOutOfOfficeBody(await request.json().catch(() => null));

	if (!body) {
		return ocsFailureResponse(ocsVersion, 400, '', { error: 'firstDay' });
	}

	if (body.status.length > 100) {
		return ocsFailureResponse(ocsVersion, 400, '', { error: 'statusLength' });
	}

	if (body.replacementUserId !== null && !findParityUser(body.replacementUserId)) {
		return ocsNotFoundNullResponse(ocsVersion);
	}

	const parsedFirstDay = new Date(`${body.firstDay}T00:00:00`);
	const parsedLastDay = new Date(`${body.lastDay}T00:00:00`);

	if (Number.isNaN(parsedFirstDay.getTime()) || Number.isNaN(parsedLastDay.getTime())) {
		return ocsFailureResponse(ocsVersion, 400, '', { error: 'firstDay' });
	}

	if (Math.floor(parsedFirstDay.getTime() / 1000) > Math.floor(parsedLastDay.getTime() / 1000)) {
		return ocsFailureResponse(ocsVersion, 400, '', { error: 'firstDay' });
	}

	const replacementUser = body.replacementUserId ? findParityUser(body.replacementUserId) : undefined;
	const absence = createOrUpdateAbsence(
		sessionUserId,
		body.firstDay,
		body.lastDay,
		body.status,
		body.message,
		body.replacementUserId,
		replacementUser?.displayName ?? null,
	);

	return ocsSuccessResponse(toConfiguredOutOfOfficeData(absence), ocsVersion);
}

export function handleClearOutOfOffice(request: Request): Response {
	const ocsVersion = parseOcsVersion(request);
	const sessionUserId = resolveAuthenticatedUserId(request);

	if (!sessionUserId) {
		return ocsUnauthorizedResponse(ocsVersion);
	}

	clearAbsence(sessionUserId);

	return ocsSuccessResponse(null, ocsVersion);
}
