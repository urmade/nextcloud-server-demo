import { isCsrfTokenValid } from '@/src/server/auth/csrf';
import { ensureCsrfToken, resolveSession } from '@/src/server/auth/session';
import { isUserInGroup } from '@/src/server/config/groups';
import { findParityUser } from '@/src/server/config/users';
import { resolveAuthenticatedUserId } from '@/src/server/ocs/auth';
import {
	SHARE_TYPE_GROUP,
	SHARE_TYPE_USER,
} from './constants';
import { findNodeByRelativePath } from './nodes';
import {
	acceptShareRecord,
	getShareByFullId,
} from './store';
import type { ShareRecord } from './types';

const HTML_CONTENT_TYPE = 'text/html; charset=UTF-8';
const JSON_HEADERS = {
	'content-type': 'application/json; charset=utf-8',
};

function acceptsHtml(request: Request): boolean {
	return (request.headers.get('accept') ?? '').toLowerCase().includes('html');
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

function requireAcceptUser(request: Request): string | Response {
	const userId = resolveAuthenticatedUserId(request);

	if (!userId) {
		if (acceptsHtml(request)) {
			return buildLoginRedirect(request);
		}

		return unauthorizedJson();
	}

	return userId;
}

function buildGuestNotFoundHtml(): string {
	return `<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8" />
	<title>404 Not Found</title>
</head>
<body id="body-login">
	<p>404 Not Found</p>
</body>
</html>`;
}

function buildGuestNotFoundResponse(): Response {
	return new Response(buildGuestNotFoundHtml(), {
		status: 404,
		headers: {
			'content-type': HTML_CONTENT_TYPE,
		},
	});
}

function redirect303(location: string): Response {
	return new Response(null, {
		status: 303,
		headers: {
			location,
		},
	});
}

function csrfFailure(): Response {
	return new Response(JSON.stringify({ message: 'CSRF check failed' }), {
		status: 412,
		headers: JSON_HEADERS,
	});
}

function isRecipient(share: ShareRecord, userId: string): boolean {
	if (share.shareType === SHARE_TYPE_USER) {
		return share.sharedWith === userId;
	}

	if (share.shareType === SHARE_TYPE_GROUP) {
		return share.sharedWith !== null && isUserInGroup(userId, share.sharedWith);
	}

	return false;
}

function buildAcceptShareHtml(filename: string, sharerDisplayName: string, csrfToken: string): string {
	return `<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8" />
	<title>Accept share</title>
</head>
<body class="guest">
<div class="guest-box accept-share">
	<form action="" method="post">
		<h2>${sharerDisplayName} shared ${filename} with you</h2>
		<p>Do you want to accept this share?</p>
		<div class="buttons">
			<input type="submit" class="primary" value="Accept">
		</div>
		<input type="hidden" name="requesttoken" value="${csrfToken}">
	</form>
</div>
</body>
</html>`;
}

function getRequestToken(request: Request, body: URLSearchParams): string {
	return request.headers.get('requesttoken')
		?? body.get('requesttoken')
		?? '';
}

export function handleShowAccept(request: Request, shareId: string): Response {
	const auth = requireAcceptUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const share = getShareByFullId(shareId);

	if (!share || !isRecipient(share, auth)) {
		return buildGuestNotFoundResponse();
	}

	const node = findNodeByRelativePath(share.path);

	if (!node) {
		return buildGuestNotFoundResponse();
	}

	const sharer = findParityUser(share.sharedBy);
	const sharerDisplayName = sharer?.displayName ?? share.sharedBy;
	const resolved = resolveSession(request);
	const csrfToken = process.env.NC_PARITY_EXAPP === 'true'
		? 'parity-accept-page-csrf'
		: ensureCsrfToken(resolved.session);

	return new Response(buildAcceptShareHtml(node.name, sharerDisplayName, csrfToken), {
		status: 200,
		headers: {
			'content-type': HTML_CONTENT_TYPE,
		},
	});
}

export async function handleAcceptPost(request: Request, shareId: string): Promise<Response> {
	const auth = requireAcceptUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const resolved = resolveSession(request);
	const bodyText = await request.text();
	const body = new URLSearchParams(bodyText);

	if (!isCsrfTokenValid(resolved.session.csrfToken, getRequestToken(request, body))) {
		return csrfFailure();
	}

	const share = getShareByFullId(shareId);

	if (!share) {
		return buildGuestNotFoundResponse();
	}

	if (!acceptShareRecord(share.id, auth)) {
		return buildGuestNotFoundResponse();
	}

	const node = findNodeByRelativePath(share.path);

	if (!node) {
		return buildGuestNotFoundResponse();
	}

	return redirect303(`/index.php/f/${node.fileId}`);
}
