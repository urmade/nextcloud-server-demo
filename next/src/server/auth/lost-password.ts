import {
	buildSessionCookieHeader,
	parseCookieHeader,
	passesStrictCookieCheck,
	SESSION_COOKIE,
} from '@/src/server/auth/cookies';
import { isCsrfTokenValid } from '@/src/server/auth/csrf';
import {
	findUserByIdOrMail,
	getParityUserEmail,
	getUserById,
	setUserPassword,
} from '@/src/server/auth/credentials';
import {
	appendSetCookieHeaders,
	resolveSession,
	type ResolvedSession,
} from '@/src/server/auth/session';
import { updateSession } from '@/src/server/auth/session-store';
import {
	captureLostPasswordMail,
	checkLostPasswordToken,
	createLostPasswordToken,
	deleteLostPasswordToken,
	getLostPasswordLinkConfig,
	LostPasswordTokenExpiredError,
	LostPasswordTokenInvalidError,
	registerLostPasswordEmailAttempt,
} from '@/src/server/auth/lost-password-store';

export const MAX_PASSWORD_LENGTH = 469;

const CSRF_FAILED_MESSAGE = 'CSRF check failed';

function acceptsHtml(request: Request): boolean {
	const accept = request.headers.get('accept') ?? '';

	return accept.toLowerCase().includes('html');
}

function jsonResponse(status: number, body: unknown, cookieHeaders: string[] = []): Response {
	const headers = new Headers({
		'content-type': 'application/json; charset=utf-8',
	});

	appendSetCookieHeaders(headers, cookieHeaders);

	return new Response(JSON.stringify(body), {
		status,
		headers,
	});
}

function emptyResponse(status: number, cookieHeaders: string[] = []): Response {
	const headers = new Headers();

	appendSetCookieHeaders(headers, cookieHeaders);

	return new Response(null, {
		status,
		headers,
	});
}

function redirectResponse(location: string, cookieHeaders: string[] = []): Response {
	const headers = new Headers({
		location,
	});

	appendSetCookieHeaders(headers, cookieHeaders);

	return new Response(null, {
		status: 303,
		headers,
	});
}

function htmlResponse(html: string, cookieHeaders: string[] = []): Response {
	const headers = new Headers({
		'content-type': 'text/html; charset=UTF-8',
	});

	appendSetCookieHeaders(headers, cookieHeaders);

	return new Response(html, {
		status: 200,
		headers,
	});
}

function ensureSessionCookie(resolved: ResolvedSession, cookieHeaders: string[]): void {
	if (resolved.isNew) {
		cookieHeaders.push(buildSessionCookieHeader(resolved.session.id));
	}
}

function extractRequestToken(request: Request, body?: string): string | null {
	if (body) {
		const contentType = request.headers.get('content-type') ?? '';

		if (contentType.includes('application/json')) {
			try {
				const parsed = JSON.parse(body) as { requesttoken?: unknown };

				if (typeof parsed.requesttoken === 'string') {
					return parsed.requesttoken;
				}
			} catch {
				// fall through
			}
		}

		const params = new URLSearchParams(body);
		const formToken = params.get('requesttoken');

		if (formToken) {
			return formToken;
		}
	}

	const url = new URL(request.url);
	const queryToken = url.searchParams.get('requesttoken');

	if (queryToken) {
		return queryToken;
	}

	return request.headers.get('requesttoken');
}

function enforceCsrf(request: Request, resolved: ResolvedSession, body?: string): Response | null {
	const cookieHeaders = [...resolved.sameSiteCookieHeaders];
	ensureSessionCookie(resolved, cookieHeaders);

	if (request.headers.get('ocs-apirequest')) {
		return null;
	}

	const cookies = parseCookieHeader(request.headers.get('cookie'));

	if (!passesStrictCookieCheck(cookies, Boolean(request.headers.get('ocs-apirequest')))) {
		const url = new URL(request.url);

		return redirectResponse(`${url.origin}/`, cookieHeaders);
	}

	const requestToken = extractRequestToken(request, body);

	if (!isCsrfTokenValid(resolved.session.csrfToken, requestToken ?? '')) {
		if (acceptsHtml(request)) {
			return htmlResponse('<!DOCTYPE html><html><body><p>CSRF check failed</p></body></html>', cookieHeaders);
		}

		return jsonResponse(412, { message: CSRF_FAILED_MESSAGE }, cookieHeaders);
	}

	return null;
}

function errorPayload(message: string, additional: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		status: 'error',
		msg: message,
		...additional,
	};
}

function successPayload(data: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		status: 'success',
		...data,
	};
}

function buildResetFormUrl(request: Request, userId: string, token: string): string {
	const url = new URL(request.url);
	url.pathname = `/lostpassword/reset/form/${encodeURIComponent(token)}/${encodeURIComponent(userId)}`;
	url.search = '';

	return url.toString();
}

function buildSetPasswordUrl(request: Request, userId: string, token: string): string {
	const url = new URL(request.url);
	url.pathname = `/lostpassword/set/${encodeURIComponent(token)}/${encodeURIComponent(userId)}`;
	url.search = '';

	return url.toString();
}

function renderResetPasswordForm(userId: string, resetPasswordTarget: string): string {
	return `<!DOCTYPE html>
<html>
<head><title>Reset password – Nextcloud</title></head>
<body id="body-login">
<div id="reset-password" data-reset-password-user="${userId}" data-reset-password-target="${resetPasswordTarget}"></div>
</body>
</html>`;
}

function renderResetPasswordError(message: string): string {
	return `<!DOCTYPE html>
<html>
<head><title>Error – Nextcloud</title></head>
<body id="body-login">
<div id="reset-password-error" class="errors"><span class="error">${message}</span></div>
</body>
</html>`;
}

export function parseLostPasswordEmailBody(request: Request, body: string): string | null {
	const contentType = request.headers.get('content-type') ?? '';

	if (contentType.includes('application/json')) {
		try {
			const parsed = JSON.parse(body) as { user?: unknown };

			if (parsed.user === undefined || parsed.user === null) {
				return '';
			}

			return String(parsed.user);
		} catch {
			return null;
		}
	}

	const params = new URLSearchParams(body);
	const user = params.get('user');

	return user ?? '';
}

export function parseSetPasswordBody(request: Request, body: string): { password: string; proceed: boolean } | null {
	const contentType = request.headers.get('content-type') ?? '';

	if (contentType.includes('application/json')) {
		try {
			const parsed = JSON.parse(body) as { password?: unknown; proceed?: unknown };

			if (typeof parsed.password !== 'string' || typeof parsed.proceed !== 'boolean') {
				return null;
			}

			return {
				password: parsed.password,
				proceed: parsed.proceed,
			};
		} catch {
			return null;
		}
	}

	const params = new URLSearchParams(body);
	const password = params.get('password');
	const proceedRaw = params.get('proceed');

	if (password === null || proceedRaw === null) {
		return null;
	}

	return {
		password,
		proceed: proceedRaw === 'true' || proceedRaw === '1',
	};
}

export function handleLostPasswordEmail(request: Request, body: string): Response {
	const resolved = resolveSession(request);
	const cookieHeaders = [...resolved.sameSiteCookieHeaders];
	ensureSessionCookie(resolved, cookieHeaders);

	const csrfFailure = enforceCsrf(request, resolved, body);

	if (csrfFailure) {
		return csrfFailure;
	}

	if (getLostPasswordLinkConfig() !== '') {
		return jsonResponse(200, errorPayload('Password reset is disabled'), cookieHeaders);
	}

	const userInput = parseLostPasswordEmailBody(request, body);

	if (userInput === null) {
		return emptyResponse(400, cookieHeaders);
	}

	const trimmedUser = userInput.trim();

	if (trimmedUser.length > 255) {
		return jsonResponse(200, errorPayload('Unsupported email length (>255)'), cookieHeaders);
	}

	const parityUser = findUserByIdOrMail(trimmedUser);

	if (parityUser?.email) {
		if (registerLostPasswordEmailAttempt(parityUser.userId)) {
			const token = createLostPasswordToken(parityUser.userId, parityUser.email);
			const resetFormUrl = buildResetFormUrl(request, parityUser.userId, token);

			captureLostPasswordMail({
				userId: parityUser.userId,
				email: parityUser.email,
				token,
				resetFormUrl,
			});
		}
	}

	return jsonResponse(200, successPayload(), cookieHeaders);
}

export function handleLostPasswordResetForm(request: Request, token: string, userId: string): Response {
	const resolved = resolveSession(request);
	const cookieHeaders = [...resolved.sameSiteCookieHeaders];
	ensureSessionCookie(resolved, cookieHeaders);

	const user = getUserById(userId);
	const email = user?.email ?? getParityUserEmail(userId) ?? '';

	try {
		checkLostPasswordToken(token, userId, email);
	} catch (error) {
		let message: string;

		if (getLostPasswordLinkConfig() === 'disabled') {
			message = 'Password reset is disabled';
		} else if (error instanceof LostPasswordTokenExpiredError) {
			message = error.message;
		} else if (error instanceof LostPasswordTokenInvalidError) {
			message = error.message;
		} else if (error instanceof Error) {
			message = error.message;
		} else {
			message = 'Could not reset password because the token is invalid';
		}

		return htmlResponse(renderResetPasswordError(message), cookieHeaders);
	}

	const resetPasswordTarget = buildSetPasswordUrl(request, userId, token);

	return htmlResponse(renderResetPasswordForm(userId, resetPasswordTarget), cookieHeaders);
}

export function handleLostPasswordSetPassword(
	request: Request,
	token: string,
	userId: string,
	body: string,
): Response {
	const resolved = resolveSession(request);
	const cookieHeaders = [...resolved.sameSiteCookieHeaders];
	ensureSessionCookie(resolved, cookieHeaders);

	const csrfFailure = enforceCsrf(request, resolved, body);

	if (csrfFailure) {
		return csrfFailure;
	}

	const parsedBody = parseSetPasswordBody(request, body);

	if (parsedBody === null) {
		return emptyResponse(400, cookieHeaders);
	}

	if (process.env.NC_PARITY_ENCRYPTION === 'true' && !parsedBody.proceed) {
		return jsonResponse(200, errorPayload('', { encryption: true }), cookieHeaders);
	}

	const user = getUserById(userId);
	const email = user?.email ?? getParityUserEmail(userId) ?? '';

	try {
		checkLostPasswordToken(token, userId, email);

		if (parsedBody.password.length > MAX_PASSWORD_LENGTH) {
			return jsonResponse(
				200,
				errorPayload('Password is too long. Maximum allowed length is 469 characters.'),
				cookieHeaders,
			);
		}

		if (!setUserPassword(userId, parsedBody.password)) {
			return jsonResponse(200, errorPayload(''), cookieHeaders);
		}

		deleteLostPasswordToken(userId);

		return jsonResponse(200, successPayload({ user: userId }), cookieHeaders);
	} catch (error) {
		if (error instanceof LostPasswordTokenExpiredError || error instanceof LostPasswordTokenInvalidError) {
			return jsonResponse(200, errorPayload(error.message), cookieHeaders);
		}

		if (error instanceof Error) {
			return jsonResponse(200, errorPayload(error.message), cookieHeaders);
		}

		return jsonResponse(200, errorPayload(''), cookieHeaders);
	}
}
