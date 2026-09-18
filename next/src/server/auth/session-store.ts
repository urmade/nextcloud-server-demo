export interface SessionData {
	id: string;
	csrfToken?: string;
	userId?: string;
	loginName?: string;
	loginToken?: string;
	loginMessages?: [ string[], string[] ];
	appPassword?: string;
	oneTimeToken?: boolean;
	lastPasswordConfirm?: number;
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

export function deleteSession(sessionId: string): void {
	getSessionMap().delete(sessionId);
}

export function clearSessionData(session: SessionData): void {
	session.userId = undefined;
	session.loginName = undefined;
	session.loginToken = undefined;
	session.loginMessages = undefined;
	session.csrfToken = undefined;
	session.appPassword = undefined;
	session.oneTimeToken = undefined;
	session.lastPasswordConfirm = undefined;
	updateSession(session);
}

export function resetSessionStore(): void {
	getSessionMap().clear();
}
