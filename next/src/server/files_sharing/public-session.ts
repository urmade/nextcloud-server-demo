import type { SessionData } from '@/src/server/auth/session-store';

export const PUBLIC_LINK_AUTHENTICATED_FRONTEND = 'public_link_authenticated_frontend';
export const PUBLIC_LINK_AUTHENTICATED_DAV = 'public_link_authenticated';
export const PUBLIC_LINK_AUTHENTICATE_REDIRECT = 'public_link_authenticate_redirect';

/**
 * Must stay a JSON object: an array default silently drops the token keys,
 * because JSON.stringify ignores non-index properties on arrays.
 */
function readFrontendTokens(session: SessionData): Record<string, string> {
	const raw = session.publicLinkAuthenticatedFrontend ?? '{}';

	try {
		const parsed = JSON.parse(raw) as unknown;

		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
			return {};
		}

		return parsed as Record<string, string>;
	} catch {
		return {};
	}
}

export function isPublicShareAuthenticated(
	session: SessionData,
	token: string,
	passwordHash: string | null,
): boolean {
	if (!passwordHash) {
		return true;
	}

	return readFrontendTokens(session)[token] === passwordHash;
}

export function storePublicShareAuth(
	session: SessionData,
	token: string,
	passwordHash: string,
): void {
	const tokens = readFrontendTokens(session);
	tokens[token] = passwordHash;
	session.publicLinkAuthenticatedFrontend = JSON.stringify(tokens);
}

export function storeDavAuthenticatedShare(session: SessionData, shareId: number): void {
	const allowed = session.publicLinkAuthenticatedDav ?? [];
	session.publicLinkAuthenticatedDav = [...new Set([...allowed, shareId])];
}

export function storeAuthenticateRedirect(session: SessionData, params: Record<string, string>): void {
	session.publicLinkAuthenticateRedirect = JSON.stringify(params);
}

export function buildAuthenticateRedirectLocation(token: string, redirect: string): string {
	return `/s/${encodeURIComponent(token)}/authenticate/${encodeURIComponent(redirect)}`;
}

export function buildPostAuthRedirectLocation(token: string, storedParams: Record<string, string> | null): string {
	if (!storedParams || storedParams.token !== token) {
		return `/s/${encodeURIComponent(token)}`;
	}

	const path = storedParams.path ?? '';

	if (path) {
		return `/s/${encodeURIComponent(token)}/${path.split('/').map(encodeURIComponent).join('/')}`;
	}

	return `/s/${encodeURIComponent(token)}`;
}
