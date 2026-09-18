import { createHash } from 'node:crypto';
import { isCsrfTokenValid } from '@/src/server/auth/csrf';
import { ensureCsrfToken, resolveSession } from '@/src/server/auth/session';
import { resolveAuthenticatedUserId } from '@/src/server/ocs/auth';
import { getProvisioningUser } from '@/src/server/provisioning/store';

const HTML_CONTENT_TYPE = 'text/html; charset=UTF-8';
const JSON_HEADERS = {
	'content-type': 'application/json; charset=utf-8',
};
const TOKEN_LIFETIME_SECONDS = 60 * 60 * 24 * 7;
const THROTTLE_HEADER = 'x-nextcloud-bruteforce-throttled';

export const MAIL_VERIFY_EXPIRED_TOKEN = 'parity-expired-mail-token';

const globalForMailVerify = globalThis as typeof globalThis & {
	__ncMailVerifyTokens?: Map<string, MailVerifyTokenRecord>;
	__ncMailVerifyLocalStatus?: Map<string, Map<string, MailVerifyLocalStatus>>;
};

interface MailVerifyTokenRecord {
	token: string;
	createdAt: number;
}

type MailVerifyLocalStatus = 'verified' | 'pending' | 'unverified';

function getSystemSecret(): string {
	return process.env.NC_SYSTEM_SECRET?.trim() || 'parity-system-secret';
}

function getTokenMap(): Map<string, MailVerifyTokenRecord> {
	if (!globalForMailVerify.__ncMailVerifyTokens) {
		globalForMailVerify.__ncMailVerifyTokens = new Map();
	}

	return globalForMailVerify.__ncMailVerifyTokens;
}

function getLocalStatusMap(): Map<string, Map<string, MailVerifyLocalStatus>> {
	if (!globalForMailVerify.__ncMailVerifyLocalStatus) {
		globalForMailVerify.__ncMailVerifyLocalStatus = new Map();
	}

	return globalForMailVerify.__ncMailVerifyLocalStatus;
}

function tokenStorageKey(userId: string, email: string): string {
	return `${userId}:${verifyMailSubject(email)}`;
}

function verifyMailSubject(email: string): string {
	return `verifyMail${createHash('sha256').update(email).digest('hex').slice(0, 8)}`;
}

export function encryptMailVerificationKey(email: string): string {
	return Buffer.from(`${getSystemSecret()}:${email}`, 'utf8').toString('base64url');
}

export function decryptMailVerificationKey(key: string): string | null {
	try {
		const decoded = Buffer.from(key, 'base64url').toString('utf8');
		const separator = decoded.indexOf(':');

		if (separator <= 0) {
			return null;
		}

		const secret = decoded.slice(0, separator);
		const email = decoded.slice(separator + 1);

		if (secret !== getSystemSecret() || email === '') {
			return null;
		}

		return email;
	} catch {
		return null;
	}
}

export function computeDeterministicMailVerifyToken(userId: string, email: string): string {
	return createHash('sha256')
		.update(`verifyMail:${userId}:${email}`)
		.digest('hex')
		.substring(0, 21);
}

export function createMailVerificationToken(userId: string, email: string): string {
	const token = computeDeterministicMailVerifyToken(userId, email);

	getTokenMap().set(tokenStorageKey(userId, email), {
		token,
		createdAt: Math.floor(Date.now() / 1000),
	});

	const statusForUser = getLocalStatusMap().get(userId) ?? new Map<string, MailVerifyLocalStatus>();
	statusForUser.set(email, 'pending');
	getLocalStatusMap().set(userId, statusForUser);

	return token;
}

export class MailVerifyTokenExpiredError extends Error {
	constructor(message = 'Could not verify mail because the token is expired.') {
		super(message);
		this.name = 'MailVerifyTokenExpiredError';
	}
}

export class MailVerifyTokenInvalidError extends Error {
	constructor(message = 'Could not verify mail because the token is invalid.') {
		super(message);
		this.name = 'MailVerifyTokenInvalidError';
	}
}

function checkMailVerificationToken(token: string, userId: string, email: string): void {
	if (token === MAIL_VERIFY_EXPIRED_TOKEN) {
		throw new MailVerifyTokenExpiredError();
	}

	const user = getProvisioningUser(userId);

	if (!user || !user.enabled) {
		throw new MailVerifyTokenInvalidError();
	}

	const record = getTokenMap().get(tokenStorageKey(userId, email));

	if (!record || record.token !== token) {
		throw new MailVerifyTokenInvalidError();
	}

	const now = Math.floor(Date.now() / 1000);

	if (record.createdAt < now - TOKEN_LIFETIME_SECONDS) {
		throw new MailVerifyTokenExpiredError();
	}
}

function deleteMailVerificationToken(userId: string, email: string): void {
	getTokenMap().delete(tokenStorageKey(userId, email));
}

function userHasEmail(userId: string, email: string): boolean {
	const user = getProvisioningUser(userId);

	if (!user) {
		return false;
	}

	return user.email === email || user.additionalMail.includes(email);
}

function markEmailLocallyVerified(userId: string, email: string): void {
	const statusForUser = getLocalStatusMap().get(userId) ?? new Map<string, MailVerifyLocalStatus>();
	statusForUser.set(email, 'verified');
	getLocalStatusMap().set(userId, statusForUser);
}

export function getMailVerificationLocalStatus(userId: string, email: string): MailVerifyLocalStatus | null {
	return getLocalStatusMap().get(userId)?.get(email) ?? null;
}

export function removeEmailFromUser(userId: string, email: string): void {
	const user = getProvisioningUser(userId);

	if (!user) {
		return;
	}

	if (user.email === email) {
		user.email = '';
	} else {
		user.additionalMail = user.additionalMail.filter((entry) => entry !== email);
	}

	getLocalStatusMap().get(userId)?.delete(email);
	getTokenMap().delete(tokenStorageKey(userId, email));
}

export function resetMailVerifyStore(): void {
	getTokenMap().clear();
	getLocalStatusMap().clear();
}

function acceptsHtml(request: Request): boolean {
	return (request.headers.get('accept') ?? '').toLowerCase().includes('html');
}

function htmlResponse(html: string, status = 200, extraHeaders: Record<string, string> = {}): Response {
	return new Response(html, {
		status,
		headers: {
			'content-type': HTML_CONTENT_TYPE,
			...extraHeaders,
		},
	});
}

function buildLoginRedirect(request: Request): Response {
	const requestUrl = new URL(request.url);
	const redirectUrl = encodeURIComponent(`${requestUrl.pathname}${requestUrl.search}`);

	return new Response(null, {
		status: 303,
		headers: {
			location: `/login?redirect_url=${redirectUrl}`,
		},
	});
}

function unauthorizedJson(): Response {
	return new Response(JSON.stringify({ message: 'Current user is not logged in' }), {
		status: 401,
		headers: JSON_HEADERS,
	});
}

function csrfFailure(): Response {
	return new Response(JSON.stringify({ message: 'CSRF check failed' }), {
		status: 412,
		headers: JSON_HEADERS,
	});
}

function buildGuestShell(content: string): string {
	return `<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8" />
	<title>Email verification</title>
</head>
<body id="body-login" class="guest">
${content}
</body>
</html>`;
}

function buildErrorHtml(message: string, throttle = false): Response {
	const html = buildGuestShell(`<div class="guest-box" data-template="core-error">
	<h2>Error</h2>
	<ul>
		<li><p>${message}</p></li>
	</ul>
</div>`);

	return htmlResponse(html, 200, throttle ? { [THROTTLE_HEADER]: '1' } : {});
}

function buildConfirmationHtml(email: string, csrfToken: string): Response {
	const html = buildGuestShell(`<div class="guest-box" data-template="core-confirmation">
	<form method="POST">
		<h2>Email confirmation</h2>
		<p>To enable the email address ${email} please click the button below.</p>
		<div class="buttons">
			<input type="submit" class="primary" value="Confirm">
		</div>
		<input type="hidden" name="requesttoken" value="${csrfToken}">
	</form>
</div>`);

	return htmlResponse(html);
}

function buildSuccessHtml(): Response {
	const html = buildGuestShell(`<div class="guest-box" data-template="core-success">
	<h2>Email confirmation successful</h2>
	<p>Email confirmation successful</p>
	<p><a class="button primary" href="/index.php">Go to Nextcloud</a></p>
</div>`);

	return htmlResponse(html);
}

function requireSessionUser(request: Request): string | Response {
	const userId = resolveAuthenticatedUserId(request);

	if (!userId) {
		if (acceptsHtml(request)) {
			return buildLoginRedirect(request);
		}

		return unauthorizedJson();
	}

	return userId;
}

function resolveEmailFromKey(key: string): string | Response {
	const email = decryptMailVerificationKey(key);

	if (email === null) {
		return buildErrorHtml('Logged in account is not mail address owner');
	}

	return email;
}

function assertOwner(sessionUserId: string, userId: string): Response | null {
	if (sessionUserId !== userId) {
		return buildErrorHtml('Logged in account is not mail address owner');
	}

	return null;
}

export function handleShowVerifyMail(
	request: Request,
	key: string,
	token: string,
	userId: string,
): Response {
	const auth = requireSessionUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const ownerError = assertOwner(auth, userId);

	if (ownerError) {
		return ownerError;
	}

	const email = resolveEmailFromKey(key);

	if (email instanceof Response) {
		return email;
	}

	const resolved = resolveSession(request);
	const csrfToken = process.env.NC_PARITY_EXAPP === 'true'
		? 'parity-mail-verify-csrf'
		: ensureCsrfToken(resolved.session);

	return buildConfirmationHtml(email, csrfToken);
}

async function readRequestToken(request: Request): Promise<string> {
	const bodyText = await request.text();

	if (bodyText) {
		const params = new URLSearchParams(bodyText);
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

	return request.headers.get('requesttoken') ?? '';
}

export async function handleVerifyMailPost(
	request: Request,
	key: string,
	token: string,
	userId: string,
): Promise<Response> {
	const auth = requireSessionUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const resolved = resolveSession(request);
	const requestToken = await readRequestToken(request);

	if (!isCsrfTokenValid(resolved.session.csrfToken, requestToken)) {
		return csrfFailure();
	}

	const ownerError = assertOwner(auth, userId);

	if (ownerError) {
		return ownerError;
	}

	const email = resolveEmailFromKey(key);

	if (email instanceof Response) {
		return email;
	}

	try {
		checkMailVerificationToken(token, userId, email);

		if (!userHasEmail(userId, email)) {
			return buildErrorHtml('Email was already removed from account and cannot be confirmed anymore.');
		}

		markEmailLocallyVerified(userId, email);
		deleteMailVerificationToken(userId, email);

		return buildSuccessHtml();
	} catch (error) {
		if (error instanceof MailVerifyTokenExpiredError) {
			return buildErrorHtml(error.message);
		}

		if (error instanceof MailVerifyTokenInvalidError) {
			return buildErrorHtml(error.message, true);
		}

		return buildErrorHtml('An unexpected error occurred. Please contact your admin.');
	}
}
