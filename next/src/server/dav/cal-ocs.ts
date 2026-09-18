import { requireAuthenticatedUser, resolveAuthenticatedUserId } from '@/src/server/ocs/auth';
import {
	ocsNotFoundNullResponse,
	ocsSuccessResponse,
	parseOcsVersion,
} from '@/src/server/ocs/respond';
import {
	acceptPendingFederatedCalendar,
	declinePendingFederatedCalendar,
	getPendingFederatedCalendars,
	getUpcomingEvents,
} from './cal-ocs-store';

export function handleGetUpcomingEvents(request: Request): Response {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const ocsVersion = parseOcsVersion(request);
	const url = new URL(request.url);
	const location = url.searchParams.get('location');

	return ocsSuccessResponse(
		{
			events: getUpcomingEvents(auth, location),
		},
		ocsVersion,
	);
}

export function handleGetPendingFederatedCalendars(request: Request): Response {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const ocsVersion = parseOcsVersion(request);

	return ocsSuccessResponse(getPendingFederatedCalendars(auth), ocsVersion);
}

export function handleAcceptFederatedCalendar(request: Request, id: number): Response {
	const ocsVersion = parseOcsVersion(request);
	const userId = resolveAuthenticatedUserId(request);

	if (!userId || !acceptPendingFederatedCalendar(id, userId)) {
		return ocsNotFoundNullResponse(ocsVersion);
	}

	return ocsSuccessResponse(null, ocsVersion);
}

export function handleDeclineFederatedCalendar(request: Request, id: number): Response {
	const ocsVersion = parseOcsVersion(request);
	const userId = resolveAuthenticatedUserId(request);

	if (!userId || !declinePendingFederatedCalendar(id, userId)) {
		return ocsNotFoundNullResponse(ocsVersion);
	}

	return ocsSuccessResponse(null, ocsVersion);
}
