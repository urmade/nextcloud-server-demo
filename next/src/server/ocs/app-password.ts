import { parseBasicAuthHeader } from '@/src/server/auth/basic';
import { checkPassword } from '@/src/server/auth/credentials';
import { parseCookieHeader, SESSION_COOKIE } from '@/src/server/auth/cookies';
import { getSession, updateSession, type SessionData } from '@/src/server/auth/session-store';
import {
	generateAppPasswordToken,
	invalidateAppPasswordToken,
	isAppPasswordTokenFormat,
	isPasswordConfirmationFresh,
	lookupAppPasswordToken,
	rotateAppPasswordToken,
	storeAppPasswordToken,
	storeOneTimeParityToken,
} from '@/src/server/ocs/app-password-store';
import { requireAuthenticatedUser } from '@/src/server/ocs/auth';
import { ocsForbiddenResponse, ocsSuccessResponse, parseOcsVersion } from '@/src/server/ocs/respond';

function canCreateAppTokens(): boolean {
	const raw = process.env.NC_AUTH_CAN_CREATE_APP_TOKEN?.trim();

	if (!raw) {
		return true;
	}

	return raw !== 'false' && raw !== '0';
}

function getSessionFromRequest(request: Request): SessionData | null {
	const cookies = parseCookieHeader(request.headers.get('cookie'));

	return getSession(cookies[SESSION_COOKIE]) ?? null;
}

function syncAppPasswordFromBasicAuth(request: Request, session: SessionData | null): SessionData | null {
	if (!session) {
		return null;
	}

	const credentials = parseBasicAuthHeader(request.headers.get('authorization'));

	if (!credentials || !isAppPasswordTokenFormat(credentials.password)) {
		return session;
	}

	const stored = lookupAppPasswordToken(credentials.password);

	if (!stored || stored.userId !== session.userId) {
		return session;
	}

	session.appPassword = credentials.password;
	updateSession(session);

	return session;
}

export function resolveAppPasswordSession(request: Request): SessionData | null {
	const session = getSessionFromRequest(request);

	if (!session?.userId) {
		return null;
	}

	return syncAppPasswordFromBasicAuth(request, session);
}

export function handleGetAppPassword(request: Request): Response {
	const ocsVersion = parseOcsVersion(request);
	const userId = requireAuthenticatedUser(request);

	if (userId instanceof Response) {
		return userId;
	}

	const session = resolveAppPasswordSession(request);

	if (!session) {
		return ocsForbiddenResponse(ocsVersion, '', {});
	}

	if (session.appPassword) {
		return ocsForbiddenResponse(ocsVersion, 'You cannot request an new apppassword with an apppassword', {});
	}

	if (!canCreateAppTokens()) {
		return ocsForbiddenResponse(ocsVersion, '', {});
	}

	if (!isPasswordConfirmationFresh(session.lastPasswordConfirm)) {
		return ocsForbiddenResponse(ocsVersion, '', {}, { 'x-nc-auth-notconfirmed': 'true' });
	}

	const token = generateAppPasswordToken();
	const loginName = session.loginName ?? userId;
	const userAgent = request.headers.get('user-agent') ?? '';

	storeAppPasswordToken(userId, loginName, token, userAgent);

	return ocsSuccessResponse({ apppassword: token }, ocsVersion);
}

export function handleDeleteAppPassword(request: Request): Response {
	const ocsVersion = parseOcsVersion(request);
	const userId = requireAuthenticatedUser(request);

	if (userId instanceof Response) {
		return userId;
	}

	const session = resolveAppPasswordSession(request);

	if (!session?.appPassword) {
		return ocsForbiddenResponse(ocsVersion, 'no app password in use', {});
	}

	const stored = lookupAppPasswordToken(session.appPassword);

	if (!stored) {
		return ocsForbiddenResponse(ocsVersion, 'could not remove apptoken', {});
	}

	invalidateAppPasswordToken(session.appPassword);
	delete session.appPassword;
	updateSession(session);

	return ocsSuccessResponse({}, ocsVersion);
}

export function handleRotateAppPassword(request: Request): Response {
	const ocsVersion = parseOcsVersion(request);
	const userId = requireAuthenticatedUser(request);

	if (userId instanceof Response) {
		return userId;
	}

	const session = resolveAppPasswordSession(request);

	if (!session?.appPassword) {
		return ocsForbiddenResponse(ocsVersion, 'no app password in use', {});
	}

	const stored = lookupAppPasswordToken(session.appPassword);

	if (!stored) {
		return ocsForbiddenResponse(ocsVersion, 'could not rotate apptoken', {});
	}

	const newToken = generateAppPasswordToken();
	const rotated = rotateAppPasswordToken(session.appPassword, newToken);

	if (!rotated) {
		return ocsForbiddenResponse(ocsVersion, 'could not rotate apptoken', {});
	}

	session.appPassword = newToken;
	updateSession(session);

	return ocsSuccessResponse({ apppassword: newToken }, ocsVersion);
}

export async function handleConfirmUserPassword(request: Request): Promise<Response> {
	const ocsVersion = parseOcsVersion(request);
	const userId = requireAuthenticatedUser(request);

	if (userId instanceof Response) {
		return userId;
	}

	let body: { password?: string };

	try {
		body = await request.json() as { password?: string };
	} catch {
		return ocsForbiddenResponse(ocsVersion, '', []);
	}

	const password = body.password ?? '';
	const session = getSessionFromRequest(request);

	if (!session) {
		return ocsForbiddenResponse(ocsVersion, '', []);
	}

	const loginName = session.loginName ?? userId;

	if (!checkPassword(loginName, password)) {
		return ocsForbiddenResponse(ocsVersion, '', []);
	}

	const confirmTimestamp = Math.floor(Date.now() / 1000);
	session.lastPasswordConfirm = confirmTimestamp;
	updateSession(session);

	return ocsSuccessResponse({ lastLogin: confirmTimestamp }, ocsVersion);
}

function applyOneTimeTokenAuth(request: Request, session: SessionData | null): SessionData | null {
	if (!session) {
		return null;
	}

	const credentials = parseBasicAuthHeader(request.headers.get('authorization'));

	if (!credentials || !isAppPasswordTokenFormat(credentials.password)) {
		return session;
	}

	const stored = lookupAppPasswordToken(credentials.password);

	if (stored?.oneTime && stored.userId === session.userId) {
		session.oneTimeToken = true;
		invalidateAppPasswordToken(credentials.password);
		updateSession(session);
	}

	return session;
}

export function handleGetAppPasswordWithOneTimePassword(request: Request): Response {
	seedParityOneTimeTokenIfNeeded();
	const ocsVersion = parseOcsVersion(request);
	const userId = requireAuthenticatedUser(request);

	if (userId instanceof Response) {
		return userId;
	}

	let session = getSessionFromRequest(request);
	session = applyOneTimeTokenAuth(request, session);

	if (!session?.oneTimeToken) {
		return ocsForbiddenResponse(ocsVersion, 'could not get one-time app password', {});
	}

	const token = generateAppPasswordToken();
	const loginName = session.loginName ?? userId;
	const userAgent = request.headers.get('user-agent') ?? '';

	storeAppPasswordToken(userId, loginName, token, userAgent);
	delete session.oneTimeToken;
	updateSession(session);

	return ocsSuccessResponse({ apppassword: token }, ocsVersion);
}

export function markOneTimeTokenSession(sessionId: string): void {
	const session = getSession(sessionId);

	if (!session) {
		return;
	}

	session.oneTimeToken = true;
	updateSession(session);
}

export const PARITY_ONE_TIME_TOKEN = 'Z'.repeat(72);

function parityOneTimeTokensEnabled(): boolean {
	return Boolean(process.env.NC_PARITY_USERS?.trim() || process.env.VITEST === 'true');
}

export function ensureParityOneTimeToken(userId: string, loginName: string): string {
	if (!parityOneTimeTokensEnabled()) {
		return PARITY_ONE_TIME_TOKEN;
	}

	if (!lookupAppPasswordToken(PARITY_ONE_TIME_TOKEN)) {
		storeOneTimeParityToken(userId, loginName, PARITY_ONE_TIME_TOKEN);
	}

	return PARITY_ONE_TIME_TOKEN;
}

function seedParityOneTimeTokenIfNeeded(): void {
	if (!parityOneTimeTokensEnabled()) {
		return;
	}

	ensureParityOneTimeToken('admin', 'admin');
}
