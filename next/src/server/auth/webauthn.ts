import { randomBytes } from 'node:crypto';
import {
	buildLoginCookieHeaders,
	buildSessionCookieHeader,
	parseCookieHeader,
	SESSION_COOKIE,
} from '@/src/server/auth/cookies';
import { isUserEnabled } from '@/src/server/auth/credentials';
import {
	appendSetCookieHeaders,
	getDefaultPageUrl,
	type ResolvedSession,
} from '@/src/server/auth/session';
import { updateSession } from '@/src/server/auth/session-store';
import {
	getWebAuthnCredentials,
	hasWebAuthnCredentials,
} from '@/src/server/auth/webauthn-store';
import {
	isTwoFactorEnabledForUser,
	prepareTwoFactorLogin,
} from '@/src/server/auth/two-factor-challenge';

export const FIXTURE_CREDENTIAL_ID = 'cGFyaXR5LWNyZWRlbnRpYWw';
export const FIXTURE_ASSERTION_DATA = JSON.stringify({
	id: FIXTURE_CREDENTIAL_ID,
	rawId: FIXTURE_CREDENTIAL_ID,
	type: 'public-key',
	response: {
		authenticatorData: 'cGFyaXR5LWF1dGgtZGF0YQ',
		clientDataJSON: 'cGFyaXR5LWNsaWVudC1kYXRh',
		signature: 'cGFyaXR5LXNpZ25hdHVyZQ',
	},
	clientExtensionResults: {},
	authenticatorAttachment: 'platform',
});

export interface PublicKeyCredentialDescriptorJson {
	type: 'public-key';
	id: string;
	transports?: string[];
}

export interface PublicKeyCredentialRequestOptionsJson {
	challenge: string;
	timeout: number;
	rpId: string;
	allowCredentials: PublicKeyCredentialDescriptorJson[];
	userVerification: 'required' | 'preferred' | 'discouraged';
}

function stripPort(host: string): string {
	return host.replace(/:\d+$/, '');
}

function toBase64Url(buffer: Buffer): string {
	return buffer
		.toString('base64')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/g, '');
}

function buildRequestOptions(
	uid: string,
	serverHost: string,
	challenge: string,
): PublicKeyCredentialRequestOptionsJson {
	const credentials = getWebAuthnCredentials(uid);
	let userVerification: PublicKeyCredentialRequestOptionsJson['userVerification'] = 'required';

	for (const credential of credentials) {
		if (!credential.userVerification) {
			userVerification = 'discouraged';
			break;
		}
	}

	return {
		challenge,
		timeout: 60000,
		rpId: stripPort(serverHost),
		allowCredentials: credentials.map((credential) => ({
			type: 'public-key',
			id: credential.credentialId,
		})),
		userVerification,
	};
}

function ensureSessionCookie(request: Request, resolved: ResolvedSession): string[] {
	const cookies = parseCookieHeader(request.headers.get('cookie'));
	const cookieHeaders = [...resolved.sameSiteCookieHeaders];

	if (!cookies[SESSION_COOKIE]) {
		cookieHeaders.push(buildSessionCookieHeader(resolved.session.id));
	}

	return cookieHeaders;
}

function jsonResponse(
	status: number,
	body: unknown,
	cookieHeaders: string[] = [],
): Response {
	const headers = new Headers({
		'content-type': 'application/json; charset=utf-8',
		'cache-control': 'no-cache, no-store, must-revalidate',
	});

	appendSetCookieHeaders(headers, cookieHeaders);

	return new Response(JSON.stringify(body), {
		status,
		headers,
	});
}

function generateLoginToken(): string {
	return randomBytes(32).toString('hex');
}

export function parseWebAuthnStartBody(body: string): { loginName: string } {
	try {
		const parsed = JSON.parse(body) as { loginName?: string };

		return {
			loginName: parsed.loginName ?? '',
		};
	} catch {
		return {
			loginName: '',
		};
	}
}

export function parseWebAuthnFinishBody(body: string): { data: string } {
	try {
		const parsed = JSON.parse(body) as { data?: string };

		return {
			data: parsed.data ?? '',
		};
	} catch {
		return {
			data: '',
		};
	}
}

export function handleWebAuthnStart(
	request: Request,
	resolved: ResolvedSession,
	body: string,
): Response {
	const { loginName } = parseWebAuthnStartBody(body);
	const uid = loginName.trim();
	const serverHost = new URL(request.url).host;
	const challenge = toBase64Url(randomBytes(32));
	const options = buildRequestOptions(uid, serverHost, challenge);
	const { session } = resolved;

	session.webauthnLogin = JSON.stringify(options);
	session.webauthnLoginUid = uid;
	session.webauthnLoginName = loginName;
	updateSession(session);

	return jsonResponse(200, options, ensureSessionCookie(request, resolved));
}

export function verifyFixtureAssertion(data: string, uid: string): boolean {
	if (!hasWebAuthnCredentials(uid)) {
		return false;
	}

	if (data !== FIXTURE_ASSERTION_DATA) {
		return false;
	}

	try {
		const parsed = JSON.parse(data) as { id?: string };

		return parsed.id === FIXTURE_CREDENTIAL_ID;
	} catch {
		return false;
	}
}

function clearWebAuthnSession(session: ResolvedSession['session']): void {
	session.webauthnLogin = undefined;
	session.webauthnLoginUid = undefined;
	session.webauthnLoginName = undefined;
}

export function handleWebAuthnFinish(
	request: Request,
	resolved: ResolvedSession,
	body: string,
): Response {
	const { session } = resolved;

	if (!session.webauthnLogin || !session.webauthnLoginUid || !session.webauthnLoginName) {
		return jsonResponse(400, [], ensureSessionCookie(request, resolved));
	}

	const uid = session.webauthnLoginUid;
	const loginName = session.webauthnLoginName;
	const { data } = parseWebAuthnFinishBody(body);

	if (!verifyFixtureAssertion(data, uid)) {
		return jsonResponse(400, [], ensureSessionCookie(request, resolved));
	}

	if (!isUserEnabled(uid)) {
		clearWebAuthnSession(session);
		updateSession(session);

		return jsonResponse(200, {
			defaultRedirectUrl: getDefaultPageUrl(request),
		}, ensureSessionCookie(request, resolved));
	}

	const loginToken = generateLoginToken();
	session.userId = uid;
	session.loginName = loginName;
	session.loginToken = loginToken;
	session.lastPasswordConfirm = Math.floor(Date.now() / 1000);
	clearWebAuthnSession(session);

	if (isTwoFactorEnabledForUser(uid)) {
		const credentials = getWebAuthnCredentials(uid);
		const userVerified = credentials.every((credential) => credential.userVerification);

		if (!userVerified) {
			prepareTwoFactorLogin(session);
		}
	}

	updateSession(session);

	const cookieHeaders = ensureSessionCookie(request, resolved);
	const maxAge = 60 * 60 * 24;
	cookieHeaders.push(...buildLoginCookieHeaders(uid, loginToken, session.id, maxAge));

	return jsonResponse(200, {
		defaultRedirectUrl: getDefaultPageUrl(request),
	}, cookieHeaders);
}
