import { parseBasicAuthHeader } from '@/src/server/auth/basic';
import { parseCookieHeader, passesStrictCookieCheck, SESSION_COOKIE } from '@/src/server/auth/cookies';
import { getSession } from '@/src/server/auth/session-store';
import { isOutgoingServer2ServerShareEnabled } from '@/src/server/files_sharing/config';
import { PERMISSION_SHARE, SHARE_TYPE_LINK } from '@/src/server/files_sharing/constants';
import { getShareByToken } from '@/src/server/files_sharing/store';
import type { ShareRecord } from '@/src/server/files_sharing/types';
import { davUnauthorizedResponse } from './auth-basic';
import { extractV2Token, type ParsedPublicDavRequest, type PublicDavIngress } from './public-remote';
import { buildNotAuthenticatedXml, buildNotFoundXml, buildPreconditionFailedXml } from './xml';

const DEFAULT_REALM = process.env.NC_DAV_REALM?.trim() || 'Nextcloud';

export interface PublicDavAuthContext {
	share: ShareRecord;
	token: string;
}

function xmlResponse(body: string, status: number, extraHeaders: Record<string, string> = {}): Response {
	return new Response(body, {
		status,
		headers: {
			'content-type': 'application/xml; charset=utf-8',
			...extraHeaders,
		},
	});
}

export function isAjaxRequest(request: Request): boolean {
	const header = request.headers.get('x-requested-with') ?? '';

	return header.split(',').map((part) => part.trim()).includes('XMLHttpRequest');
}

export function isMethodGateBlocked(method: string, ingress: PublicDavIngress, isAjax: boolean): boolean {
	if (isOutgoingServer2ServerShareEnabled() || isAjax) {
		return false;
	}

	if (ingress === 'legacy-webdav') {
		return true;
	}

	const normalized = method.toUpperCase();

	return normalized !== 'GET' && normalized !== 'HEAD';
}

function isPasswordProtected(share: ShareRecord): boolean {
	return share.password !== null && share.password !== '';
}

function isShareInDavSession(sessionShareIds: number[] | undefined, shareId: number, legacy: boolean): boolean {
	if (!sessionShareIds) {
		return false;
	}

	if (legacy) {
		return sessionShareIds.length === 1 && sessionShareIds[0] === shareId;
	}

	return sessionShareIds.includes(shareId);
}

function checkSharePassword(share: ShareRecord, password: string): boolean {
	if (!isPasswordProtected(share)) {
		return true;
	}

	return share.password === password;
}

function readDavSession(request: Request): number[] | undefined {
	const cookies = parseCookieHeader(request.headers.get('cookie'));
	const session = getSession(cookies[SESSION_COOKIE]);

	return session?.publicLinkAuthenticatedDav;
}

function hasCookies(request: Request): boolean {
	return Object.keys(parseCookieHeader(request.headers.get('cookie'))).length > 0;
}

function methodGateResponse(request: Request): Response {
	if (isAjaxRequest(request)) {
		return xmlResponse(
			buildNotAuthenticatedXml('Cannot authenticate over ajax calls'),
			401,
			{ 'www-authenticate': `DummyBasic realm="${DEFAULT_REALM}"` },
		);
	}

	return davUnauthorizedResponse();
}

function authenticateShare(
	request: Request,
	share: ShareRecord,
	token: string,
	legacy: boolean,
): Response | null {
	const cookies = parseCookieHeader(request.headers.get('cookie'));
	const davSession = readDavSession(request);

	if (hasCookies(request) && !passesStrictCookieCheck(cookies, false) && isPasswordProtected(share)) {
		return xmlResponse(buildPreconditionFailedXml('Strict cookie check failed'), 412, {
			location: `/s/${encodeURIComponent(token)}`,
		});
	}

	if (isShareInDavSession(davSession, share.id, legacy)) {
		return null;
	}

	const credentials = parseBasicAuthHeader(request.headers.get('authorization'));

	if (credentials) {
		if (!checkSharePassword(share, credentials.password)) {
			if (isAjaxRequest(request)) {
				return methodGateResponse(request);
			}

			return davUnauthorizedResponse('Username or password was incorrect');
		}

		return null;
	}

	if (isPasswordProtected(share)) {
		return davUnauthorizedResponse();
	}

	return null;
}

export function authenticatePublicDav(
	request: Request,
	parsed: ParsedPublicDavRequest,
): PublicDavAuthContext | Response {
	if (isMethodGateBlocked(request.method, parsed.ingress, isAjaxRequest(request))) {
		return methodGateResponse(request);
	}

	if (parsed.ingress === 'v2') {
		const token = extractV2Token(parsed.davPath);

		if (token === 'invalid-path') {
			return xmlResponse(buildNotFoundXml('File not found'), 404);
		}

		const share = getShareByToken(token);

		if (!share || share.shareType !== SHARE_TYPE_LINK) {
			return xmlResponse(buildNotFoundXml('File not found'), 404);
		}

		const authError = authenticateShare(request, share, token, false);

		if (authError) {
			return authError;
		}

		return { share, token };
	}

	const credentials = parseBasicAuthHeader(request.headers.get('authorization'));

	if (!credentials?.username) {
		return davUnauthorizedResponse();
	}

	const share = getShareByToken(credentials.username);

	if (!share || share.shareType !== SHARE_TYPE_LINK) {
		return davUnauthorizedResponse();
	}

	const authError = authenticateShare(request, share, credentials.username, true);

	if (authError) {
		return authError;
	}

	return { share, token: credentials.username };
}

export function sharePermissionsString(permissions: number): string {
	const mask = permissions | PERMISSION_SHARE;
	let result = '';

	if (mask & 1) {
		result += 'R';
	}

	if (mask & 2) {
		result += 'G';
	}

	if (mask & 4) {
		result += 'C';
	}

	if (mask & 8) {
		result += 'D';
	}

	if (mask & 16) {
		result += 'N';
	}

	if (result.includes('R')) {
		result += 'V';
	}

	if (result.length === 0) {
		result = 'CK';
	} else if (!result.includes('K')) {
		result += 'K';
	}

	return result;
}
