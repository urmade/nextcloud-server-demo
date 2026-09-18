import { parseBasicAuthHeader } from '@/src/server/auth/basic';
import { checkPassword } from '@/src/server/auth/credentials';
import { findParityUser } from '@/src/server/config/users';
import { updateSession } from '@/src/server/auth/session-store';
import { isPasswordConfirmationFresh } from '@/src/server/ocs/app-password-store';
import { getSessionFromRequest, requireAdminUser } from '@/src/server/ocs/admin-auth';
import {
	ocsForbiddenResponse,
	ocsNotFoundNullResponse,
	ocsSuccessResponse,
	parseOcsVersion,
} from '@/src/server/ocs/respond';
import {
	getTwoFactorProviderStates,
	tryDisableTwoFactorProvider,
	tryEnableTwoFactorProvider,
} from '@/src/server/two-factor/store';
import type { TwoFactorDisableRequest, TwoFactorEnableRequest } from '@/src/server/two-factor/types';

const PASSWORD_CONFIRMATION_REQUIRED = 'Password confirmation is required';
const REQUIRED_AUTHORIZATION_HEADER_MISSING = 'Required authorization header missing';

function parseJsonBody<T>(request: Request): Promise<T | null> {
	return request.json().catch(() => null);
}

function resolveTargetUserId(user: string | null): string | null {
	if (!user) {
		return null;
	}

	return findParityUser(user) ? user : null;
}

function requireFreshPasswordConfirmation(request: Request): Response | null {
	const session = getSessionFromRequest(request);

	if (!session || !isPasswordConfirmationFresh(session.lastPasswordConfirm)) {
		return ocsForbiddenResponse(parseOcsVersion(request), PASSWORD_CONFIRMATION_REQUIRED, {}, {
			'x-nc-auth-notconfirmed': 'true',
		});
	}

	return null;
}

function requireStrictPasswordConfirmation(request: Request): Response | null {
	const credentials = parseBasicAuthHeader(request.headers.get('authorization'));
	const password = credentials?.password ?? '';

	if (password === '') {
		return ocsForbiddenResponse(parseOcsVersion(request), REQUIRED_AUTHORIZATION_HEADER_MISSING, {});
	}

	const session = getSessionFromRequest(request);
	const loginName = session?.loginName ?? credentials?.username ?? '';

	if (!checkPassword(loginName, password)) {
		return ocsForbiddenResponse(parseOcsVersion(request), PASSWORD_CONFIRMATION_REQUIRED, {});
	}

	if (session) {
		session.lastPasswordConfirm = Math.floor(Date.now() / 1000);
		updateSession(session);
	}

	return null;
}

export function handleTwoFactorState(request: Request): Response {
	const ocsVersion = parseOcsVersion(request);
	const admin = requireAdminUser(request);

	if (admin instanceof Response) {
		return admin;
	}

	const url = new URL(request.url);
	const targetUserId = resolveTargetUserId(url.searchParams.get('user'));

	if (!targetUserId) {
		return ocsNotFoundNullResponse(ocsVersion);
	}

	return ocsSuccessResponse(getTwoFactorProviderStates(targetUserId), ocsVersion);
}

export async function handleTwoFactorEnable(request: Request): Promise<Response> {
	const ocsVersion = parseOcsVersion(request);
	const admin = requireAdminUser(request);

	if (admin instanceof Response) {
		return admin;
	}

	const passwordConfirmation = requireFreshPasswordConfirmation(request);

	if (passwordConfirmation) {
		return passwordConfirmation;
	}

	const body = await parseJsonBody<TwoFactorEnableRequest>(request);
	const targetUserId = body?.user ? resolveTargetUserId(body.user) : null;

	if (!targetUserId) {
		return ocsNotFoundNullResponse(ocsVersion);
	}

	for (const providerId of body?.providers ?? []) {
		tryEnableTwoFactorProvider(providerId, targetUserId);
	}

	return ocsSuccessResponse(getTwoFactorProviderStates(targetUserId), ocsVersion);
}

export async function handleTwoFactorDisable(request: Request): Promise<Response> {
	const ocsVersion = parseOcsVersion(request);
	const admin = requireAdminUser(request);

	if (admin instanceof Response) {
		return admin;
	}

	const passwordConfirmation = requireStrictPasswordConfirmation(request);

	if (passwordConfirmation) {
		return passwordConfirmation;
	}

	const body = await parseJsonBody<TwoFactorDisableRequest>(request);
	const targetUserId = body?.user ? resolveTargetUserId(body.user) : null;

	if (!targetUserId) {
		return ocsNotFoundNullResponse(ocsVersion);
	}

	for (const providerId of body?.providers ?? []) {
		tryDisableTwoFactorProvider(providerId, targetUserId);
	}

	return ocsSuccessResponse(getTwoFactorProviderStates(targetUserId), ocsVersion);
}
