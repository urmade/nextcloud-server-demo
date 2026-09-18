import {
	buildLoginCookieHeaders,
	buildSessionCookieHeader,
	parseCookieHeader,
	SESSION_COOKIE,
} from '@/src/server/auth/cookies';
import {
	appendSetCookieHeaders,
	getDefaultPageUrl,
	type ResolvedSession,
} from '@/src/server/auth/session';
import { updateSession } from '@/src/server/auth/session-store';
import { getParityTwoFactorProviders, getLoginSetupProviderIds } from '@/src/server/two-factor/catalog';
import { isMandatoryTwoFactorEnforced } from '@/src/server/two-factor/enforcement';
import { getTwoFactorProviderStates } from '@/src/server/two-factor/store';

export const FIXTURE_PROVIDER_ID = 'parity-totp';
export const FIXTURE_PROVIDER_DISPLAY_NAME = 'Parity TOTP';
export const FIXTURE_SETUP_PROVIDER_ID = 'parity-setup';
export const FIXTURE_SETUP_PROVIDER_DISPLAY_NAME = 'Parity Setup';
export const FIXTURE_CHALLENGE_CODE = process.env.NC_PARITY_TWO_FACTOR_CODE?.trim() || '123456';

export function isTwoFactorEnabledForUser(userId: string): boolean {
	const states = getTwoFactorProviderStates(userId);

	return getParityTwoFactorProviders()
		.filter((provider) => provider.enableByAdmin)
		.some((provider) => states[provider.id] === true);
}

export function isTwoFactorAuthenticated(userId: string): boolean {
	if (isMandatoryTwoFactorEnforced(userId)) {
		return true;
	}

	return isTwoFactorEnabledForUser(userId);
}

export function needsSecondFactor(session: ResolvedSession['session']): boolean {
	if (!session.userId) {
		return false;
	}

	if (session.appPassword || session.appApi) {
		return false;
	}

	if (session.twoFactorDone === session.userId) {
		return false;
	}

	if (!isTwoFactorAuthenticated(session.userId)) {
		return false;
	}

	return session.twoFactorPendingUid === session.userId;
}

export function prepareTwoFactorLogin(session: ResolvedSession['session'], rememberMe = false): void {
	session.twoFactorPendingUid = session.userId;
	session.twoFactorRememberLogin = rememberMe;
	session.twoFactorDone = undefined;
	updateSession(session);
}

export function completeTwoFactorLogin(session: ResolvedSession['session']): void {
	if (session.userId) {
		session.twoFactorDone = session.userId;
	}

	session.twoFactorPendingUid = undefined;
	session.twoFactorRememberLogin = undefined;
	session.twoFactorAuthError = undefined;
	session.twoFactorAuthErrorMessage = undefined;
	updateSession(session);
}

function getLogoutUrl(): string {
	return '/logout';
}

function buildHtmlResponse(html: string, cookieHeaders: string[] = []): Response {
	const headers = new Headers({
		'content-type': 'text/html; charset=UTF-8',
		'cache-control': 'no-cache, no-store, must-revalidate',
	});

	appendSetCookieHeaders(headers, cookieHeaders);

	return new Response(html, {
		status: 200,
		headers,
	});
}

function buildRedirectResponse(
	request: Request,
	location: string,
	cookieHeaders: string[] = [],
): Response {
	const headers = new Headers({
		location: new URL(location, request.url).toString(),
	});

	appendSetCookieHeaders(headers, cookieHeaders);

	return new Response(null, {
		status: 303,
		headers,
	});
}

function ensureSessionCookie(request: Request, resolved: ResolvedSession): string[] {
	const cookies = parseCookieHeader(request.headers.get('cookie'));
	const cookieHeaders = [...resolved.sameSiteCookieHeaders];

	if (!cookies[SESSION_COOKIE]) {
		cookieHeaders.push(buildSessionCookieHeader(resolved.session.id));
	}

	return cookieHeaders;
}

function requireTwoFactorChallengeAccess(
	request: Request,
	resolved: ResolvedSession,
): Response | null {
	const { session } = resolved;

	if (!session.userId) {
		return buildRedirectResponse(request, '/login', ensureSessionCookie(request, resolved));
	}

	if (!needsSecondFactor(session)) {
		return buildRedirectResponse(request, getDefaultPageUrl(request), ensureSessionCookie(request, resolved));
	}

	return null;
}

function getEnabledProviders(userId: string): string[] {
	const states = getTwoFactorProviderStates(userId);

	return getParityTwoFactorProviders()
		.filter((provider) => provider.enableByAdmin && states[provider.id] === true)
		.map((provider) => provider.id);
}

function requireTwoFactorSetupAccess(
	request: Request,
	resolved: ResolvedSession,
): Response | null {
	const { session } = resolved;

	if (!session.userId) {
		return buildRedirectResponse(request, '/login', ensureSessionCookie(request, resolved));
	}

	if (session.twoFactorDone === session.userId) {
		return buildRedirectResponse(request, getDefaultPageUrl(request), ensureSessionCookie(request, resolved));
	}

	if (getEnabledProviders(session.userId).length > 0) {
		return buildRedirectResponse(request, '/login/selectchallenge', ensureSessionCookie(request, resolved));
	}

	if (!needsSecondFactor(session)) {
		return buildRedirectResponse(request, getDefaultPageUrl(request), ensureSessionCookie(request, resolved));
	}

	return null;
}

function renderSetupSelectionPage(userId: string, redirectUrl: string | null): string {
	const providers = getLoginSetupProviderIds();
	const logoutUrl = getLogoutUrl();
	const redirectAttr = redirectUrl ? ` data-redirect-url="${redirectUrl}"` : '';

	return `<!DOCTYPE html>
<html>
<head><title>Two-factor authentication – Nextcloud</title></head>
<body id="body-login">
<div class="body-login-container update two-factor" id="twofactor-setup-select"${redirectAttr}>
<h2 class="two-factor-header">Set up two-factor authentication</h2>
<ul>
${providers.map((providerId) => `<li><a class="two-factor-provider" href="/login/setupchallenge/${providerId}">${providerId}</a></li>`).join('\n')}
</ul>
<p><a id="cancel-login" class="two-factor-secondary" href="${logoutUrl}">Cancel login</a></p>
</div>
</body>
</html>`;
}

function renderSetupChallengePage(providerId: string, redirectUrl: string | null): string {
	const logoutUrl = getLogoutUrl();
	const redirectField = redirectUrl
		? `<input type="hidden" name="redirect_url" value="${redirectUrl}" />`
		: '';
	const displayName = providerId === FIXTURE_SETUP_PROVIDER_ID
		? FIXTURE_SETUP_PROVIDER_DISPLAY_NAME
		: providerId;

	return `<!DOCTYPE html>
<html>
<head><title>Two-factor authentication – Nextcloud</title></head>
<body id="body-login">
<div class="body-login-container update two-factor" id="twofactor-setup-challenge">
<h2 class="two-factor-header">${displayName}</h2>
<div class="two-factor-setup-body">
<p>Set up ${displayName} to continue.</p>
</div>
<form method="post" action="/login/setupchallenge/${providerId}">
${redirectField}
<button type="submit">Continue</button>
</form>
<p><a id="cancel-login" class="two-factor-secondary" href="${logoutUrl}">Cancel login</a></p>
</div>
</body>
</html>`;
}

function renderSelectChallengePage(userId: string, request: Request, redirectUrl: string | null): string {
	const providers = getEnabledProviders(userId);
	const logoutUrl = getLogoutUrl();
	const redirectAttr = redirectUrl ? ` data-redirect-url="${redirectUrl}"` : '';

	return `<!DOCTYPE html>
<html>
<head><title>Two-factor authentication – Nextcloud</title></head>
<body id="body-login">
<div class="body-login-container update two-factor" id="twofactor-select"${redirectAttr}>
<h2 class="two-factor-header">Two-factor authentication</h2>
<ul>
${providers.map((providerId) => `<li><a class="two-factor-provider" href="/login/challenge/${providerId}">${providerId}</a></li>`).join('\n')}
</ul>
<p><a id="cancel-login" class="two-factor-secondary" href="${logoutUrl}">Cancel login</a></p>
</div>
</body>
</html>`;
}

function renderShowChallengePage(
	request: Request,
	providerId: string,
	redirectUrl: string | null,
	error: boolean,
	errorMessage: string | null,
): string {
	const logoutUrl = getLogoutUrl();
	const redirectField = redirectUrl
		? `<input type="hidden" name="redirect_url" value="${redirectUrl}" />`
		: '';

	return `<!DOCTYPE html>
<html>
<head><title>Two-factor authentication – Nextcloud</title></head>
<body id="body-login">
<div class="body-login-container update two-factor" id="twofactor-challenge">
<h2 class="two-factor-header">${providerId === FIXTURE_PROVIDER_ID ? FIXTURE_PROVIDER_DISPLAY_NAME : providerId}</h2>
${error ? `<p class="two-factor-error"><strong>${errorMessage ?? 'Error while validating your second factor'}</strong></p>` : ''}
<form method="post" action="/login/challenge/${providerId}">
${redirectField}
<label for="challenge">Authentication code</label>
<input id="challenge" name="challenge" type="text" autocomplete="one-time-code" />
<button type="submit">Verify</button>
</form>
<p><a id="cancel-login" class="two-factor-secondary" href="${logoutUrl}">Cancel login</a></p>
</div>
</body>
</html>`;
}

export function handleSelectChallengeGet(request: Request, resolved: ResolvedSession): Response {
	const denied = requireTwoFactorChallengeAccess(request, resolved);

	if (denied) {
		return denied;
	}

	const redirectUrl = new URL(request.url).searchParams.get('redirect_url');
	const cookieHeaders = ensureSessionCookie(request, resolved);
	const html = renderSelectChallengePage(resolved.session.userId ?? '', request, redirectUrl);
	const headers = new Headers({
		'content-type': 'text/html; charset=UTF-8',
		'cache-control': 'no-cache, no-store, must-revalidate',
	});

	appendSetCookieHeaders(headers, cookieHeaders);

	return new Response(html, {
		status: 200,
		headers,
	});
}

export function handleShowChallengeGet(
	request: Request,
	resolved: ResolvedSession,
	challengeProviderId: string,
): Response {
	const denied = requireTwoFactorChallengeAccess(request, resolved);

	if (denied) {
		return denied;
	}

	const { session } = resolved;
	const redirectUrl = new URL(request.url).searchParams.get('redirect_url');
	const providers = getEnabledProviders(session.userId ?? '');
	const providerExists = providers.includes(challengeProviderId);

	if (!providerExists) {
		return buildRedirectResponse(request, '/login/selectchallenge', ensureSessionCookie(request, resolved));
	}

	const error = session.twoFactorAuthError === true;
	const errorMessage = session.twoFactorAuthErrorMessage ?? null;

	if (error) {
		session.twoFactorAuthError = undefined;
		session.twoFactorAuthErrorMessage = undefined;
		updateSession(session);
	}

	return buildHtmlResponse(
		renderShowChallengePage(request, challengeProviderId, redirectUrl, error, errorMessage),
		ensureSessionCookie(request, resolved),
	);
}

export function parseSolveChallengeForm(body: string): { challenge: string; redirect_url: string | null } {
	const params = new URLSearchParams(body);

	return {
		challenge: params.get('challenge') ?? '',
		redirect_url: params.get('redirect_url'),
	};
}

export function verifyFixtureChallenge(challenge: string): boolean {
	return challenge === FIXTURE_CHALLENGE_CODE;
}

export function handleSolveChallengePost(
	request: Request,
	resolved: ResolvedSession,
	challengeProviderId: string,
	body: string,
): Response {
	const denied = requireTwoFactorChallengeAccess(request, resolved);

	if (denied) {
		return denied;
	}

	const { session } = resolved;
	const providers = getEnabledProviders(session.userId ?? '');

	if (!providers.includes(challengeProviderId)) {
		return buildRedirectResponse(request, '/login/selectchallenge', ensureSessionCookie(request, resolved));
	}

	const form = parseSolveChallengeForm(body);

	if (!verifyFixtureChallenge(form.challenge)) {
		session.twoFactorAuthError = true;
		updateSession(session);

		const redirectParams = new URLSearchParams();

		if (form.redirect_url) {
			redirectParams.set('redirect_url', form.redirect_url);
		}

		const location = `/login/challenge/${challengeProviderId}${redirectParams.toString() ? `?${redirectParams.toString()}` : ''}`;

		return buildRedirectResponse(request, location, ensureSessionCookie(request, resolved));
	}

	completeTwoFactorLogin(session);

	const cookieHeaders = ensureSessionCookie(request, resolved);

	if (session.userId && session.loginToken) {
		const maxAge = session.twoFactorRememberLogin ? 60 * 60 * 24 * 15 : 60 * 60 * 24;
		cookieHeaders.push(...buildLoginCookieHeaders(session.userId, session.loginToken, session.id, maxAge));
	}

	if (form.redirect_url) {
		try {
			return buildRedirectResponse(request, decodeURIComponent(form.redirect_url), cookieHeaders);
		} catch {
			return buildRedirectResponse(request, getDefaultPageUrl(request), cookieHeaders);
		}
	}

	return buildRedirectResponse(request, getDefaultPageUrl(request), cookieHeaders);
}

export function getTwoFactorLoginRedirectUrl(request: Request, userId: string): string {
	const providers = getEnabledProviders(userId);
	const setupProviders = getLoginSetupProviderIds();

	if (providers.length === 0 && setupProviders.length > 0 && isMandatoryTwoFactorEnforced(userId)) {
		return '/login/setupchallenge';
	}

	if (providers.length === 1) {
		return `/login/challenge/${providers[0]}`;
	}

	return '/login/selectchallenge';
}

export function handleSetupProvidersGet(request: Request, resolved: ResolvedSession): Response {
	const denied = requireTwoFactorSetupAccess(request, resolved);

	if (denied) {
		return denied;
	}

	const redirectUrl = new URL(request.url).searchParams.get('redirect_url');
	const cookieHeaders = ensureSessionCookie(request, resolved);

	return buildHtmlResponse(
		renderSetupSelectionPage(resolved.session.userId ?? '', redirectUrl),
		cookieHeaders,
	);
}

export function handleSetupProviderGet(
	request: Request,
	resolved: ResolvedSession,
	providerId: string,
): Response {
	const denied = requireTwoFactorSetupAccess(request, resolved);

	if (denied) {
		return denied;
	}

	const setupProviders = getLoginSetupProviderIds();

	if (!setupProviders.includes(providerId)) {
		return buildRedirectResponse(request, '/login/selectchallenge', ensureSessionCookie(request, resolved));
	}

	const redirectUrl = new URL(request.url).searchParams.get('redirect_url');

	return buildHtmlResponse(
		renderSetupChallengePage(providerId, redirectUrl),
		ensureSessionCookie(request, resolved),
	);
}

export function handleConfirmProviderSetupPost(
	request: Request,
	resolved: ResolvedSession,
	providerId: string,
): Response {
	const denied = requireTwoFactorSetupAccess(request, resolved);

	if (denied) {
		return denied;
	}

	const redirectUrl = new URL(request.url).searchParams.get('redirect_url');
	const location = redirectUrl
		? `/login/challenge/${providerId}?redirect_url=${encodeURIComponent(redirectUrl)}`
		: `/login/challenge/${providerId}`;

	return buildRedirectResponse(request, location, ensureSessionCookie(request, resolved));
}
