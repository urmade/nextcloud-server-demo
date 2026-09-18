export interface SessionData {
	id: string;
	csrfToken?: string;
	userId?: string;
	loginName?: string;
	loginToken?: string;
	loginFlowV2Token?: string;
	loginFlowV2StateToken?: string;
	loginMessages?: [ string[], string[] ];
	appPassword?: string;
	oneTimeToken?: boolean;
	lastPasswordConfirm?: number;
	appApi?: boolean;
	twoFactorPendingUid?: string;
	twoFactorDone?: string;
	twoFactorRememberLogin?: boolean;
	twoFactorAuthError?: boolean;
	twoFactorAuthErrorMessage?: string;
	webauthnLogin?: string;
	webauthnLoginUid?: string;
	webauthnLoginName?: string;
	publicLinkAuthenticateRedirect?: string;
	publicLinkAuthenticatedFrontend?: string;
	publicLinkAuthenticatedDav?: number[];
}

const globalForSessions = globalThis as typeof globalThis & {
	__ncAuthSessions?: Map<string, SessionData>;
};

function getSessionMap(): Map<string, SessionData> {
	if (!globalForSessions.__ncAuthSessions) {
		globalForSessions.__ncAuthSessions = new Map();
	}

	return globalForSessions.__ncAuthSessions;
}

function generateSessionId(): string {
	return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 18)}`;
}

export function getSession(sessionId: string | undefined): SessionData | null {
	if (!sessionId) {
		return null;
	}

	return getSessionMap().get(sessionId) ?? null;
}

export function createSession(): SessionData {
	const session: SessionData = {
		id: generateSessionId(),
	};

	getSessionMap().set(session.id, session);

	return session;
}

export function getOrCreateSession(sessionId: string | undefined): SessionData {
	if (sessionId) {
		const existing = getSession(sessionId);

		if (existing) {
			return existing;
		}

		const session: SessionData = { id: sessionId };
		getSessionMap().set(sessionId, session);

		return session;
	}

	return createSession();
}

export function updateSession(session: SessionData): void {
	getSessionMap().set(session.id, session);
}

/**
 * PHP `session_regenerate_id()`: keep the session data, move it to a fresh id
 * and drop the old entry. Callers must send the new session cookie.
 */
export function regenerateSessionId(session: SessionData): SessionData {
	const regenerated: SessionData = { ...session, id: generateSessionId() };

	getSessionMap().delete(session.id);
	getSessionMap().set(regenerated.id, regenerated);

	return regenerated;
}

export function deleteSession(sessionId: string): void {
	getSessionMap().delete(sessionId);
}

export function clearSessionData(session: SessionData): void {
	session.userId = undefined;
	session.loginName = undefined;
	session.loginToken = undefined;
	session.loginFlowV2Token = undefined;
	session.loginFlowV2StateToken = undefined;
	session.loginMessages = undefined;
	session.csrfToken = undefined;
	session.appPassword = undefined;
	session.oneTimeToken = undefined;
	session.lastPasswordConfirm = undefined;
	session.appApi = undefined;
	session.twoFactorPendingUid = undefined;
	session.twoFactorDone = undefined;
	session.twoFactorRememberLogin = undefined;
	session.twoFactorAuthError = undefined;
	session.twoFactorAuthErrorMessage = undefined;
	session.webauthnLogin = undefined;
	session.webauthnLoginUid = undefined;
	session.webauthnLoginName = undefined;
	session.publicLinkAuthenticateRedirect = undefined;
	session.publicLinkAuthenticatedFrontend = undefined;
	session.publicLinkAuthenticatedDav = undefined;
	updateSession(session);
}

export function resetSessionStore(): void {
	getSessionMap().clear();
}
