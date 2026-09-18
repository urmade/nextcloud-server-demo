import { isCsrfTokenValid } from '@/src/server/auth/csrf';
import { parseCookieHeader, SESSION_COOKIE } from '@/src/server/auth/cookies';
import { getSession } from '@/src/server/auth/session-store';
import { resolveAuthenticatedUserId } from '@/src/server/ocs/auth';
import { getAdminFilesHome } from '@/src/server/dav/store';
import type { DavFileNode } from '@/src/server/dav/types';
import {
	isWithinAvatarSizeLimit,
	parseImage,
	toDataUrl,
	type ParsedImage,
} from '@/src/server/avatar/image';
import { removeCustomAvatar, setCustomAvatar } from '@/src/server/avatar/store';

const JSON_HEADERS = {
	'content-type': 'application/json; charset=utf-8',
};

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: JSON_HEADERS,
	});
}

function acceptsHtml(request: Request): boolean {
	return (request.headers.get('accept') ?? '').toLowerCase().includes('html');
}

function unauthenticatedResponse(request: Request): Response {
	if (acceptsHtml(request)) {
		const requestUrl = new URL(request.url);
		const redirectUrl = encodeURIComponent(`${requestUrl.pathname}${requestUrl.search}`);

		return new Response(null, {
			status: 303,
			headers: {
				location: `/login?redirect_url=${redirectUrl}`,
			},
		});
	}

	return jsonResponse(401, { message: 'Current user is not logged in' });
}

function csrfFailedResponse(): Response {
	return jsonResponse(412, { message: 'CSRF check failed' });
}

function extractRequestToken(request: Request, formData?: FormData): string {
	const url = new URL(request.url);
	const queryToken = url.searchParams.get('requesttoken');

	if (queryToken) {
		return queryToken;
	}

	const headerToken = request.headers.get('requesttoken');

	if (headerToken) {
		return headerToken;
	}

	const formToken = formData?.get('requesttoken');

	return typeof formToken === 'string' ? formToken : '';
}

function enforceSessionAndCsrf(request: Request, formData?: FormData): string | Response {
	const userId = resolveAuthenticatedUserId(request);

	if (!userId) {
		return unauthenticatedResponse(request);
	}

	const cookies = parseCookieHeader(request.headers.get('cookie'));
	const session = getSession(cookies[SESSION_COOKIE]);
	const token = extractRequestToken(request, formData);

	if (!isCsrfTokenValid(session?.csrfToken, token)) {
		return csrfFailedResponse();
	}

	return userId;
}

function findUserFile(userId: string, relativePath: string): DavFileNode | 'folder' | null {
	const segments = relativePath.replace(/^\/+/, '').split('/').filter(Boolean);

	if (segments.length === 0) {
		return null;
	}

	let current: DavFileNode = getAdminFilesHome();

	if (userId !== current.name) {
		return null;
	}

	for (let index = 0; index < segments.length; index += 1) {
		const segment = segments[index];
		const child = current.children?.find((entry) => entry.name === segment);

		if (!child) {
			return null;
		}

		if (index === segments.length - 1) {
			return child.kind === 'file' ? child : 'folder';
		}

		if (child.kind !== 'directory') {
			return null;
		}

		current = child;
	}

	return null;
}

function respondWithImage(userId: string, image: ParsedImage | null): Response {
	if (!image) {
		return jsonResponse(200, { data: { message: 'Invalid image' } });
	}

	if (image.width === image.height) {
		setCustomAvatar(userId, image);

		return jsonResponse(200, { status: 'success' });
	}

	return jsonResponse(200, {
		data: 'notsquare',
		image: toDataUrl(image),
	});
}

export async function handlePostAvatar(request: Request): Promise<Response> {
	const contentType = request.headers.get('content-type') ?? '';

	if (contentType.includes('multipart/form-data')) {
		const formData = await request.formData();
		const auth = enforceSessionAndCsrf(request, formData);

		if (auth instanceof Response) {
			return auth;
		}

		const file = formData.get('files');

		if (!(file instanceof File)) {
			return jsonResponse(400, { data: { message: 'No image or file provided' } });
		}

		const bytes = Buffer.from(await file.arrayBuffer());

		if (!isWithinAvatarSizeLimit(bytes)) {
			return jsonResponse(400, { data: { message: 'File is too big' } });
		}

		return respondWithImage(auth, parseImage(bytes));
	}

	const auth = enforceSessionAndCsrf(request);

	if (auth instanceof Response) {
		return auth;
	}

	const text = await request.text();
	const params = new URLSearchParams(text);
	const path = params.get('path');

	if (!path) {
		return jsonResponse(400, { data: { message: 'No image or file provided' } });
	}

	const node = findUserFile(auth, path.replace(/\\/g, '/'));

	if (!node) {
		return jsonResponse(400, { data: { message: 'The selected file cannot be read.' } });
	}

	if (node === 'folder') {
		return jsonResponse(200, { data: { message: 'Please select a file.' } });
	}

	if (node.contentType !== 'image/jpeg' && node.contentType !== 'image/png') {
		return jsonResponse(400, { data: { message: 'The selected file is not an image.' } });
	}

	const bytes = Buffer.from(node.content ?? '', 'latin1');

	if (!isWithinAvatarSizeLimit(bytes)) {
		return jsonResponse(400, { data: { message: 'File is too big' } });
	}

	return respondWithImage(auth, parseImage(bytes));
}

export async function handleDeleteAvatar(request: Request): Promise<Response> {
	const auth = enforceSessionAndCsrf(request);

	if (auth instanceof Response) {
		return auth;
	}

	removeCustomAvatar(auth);

	return new Response('[]', {
		status: 200,
		headers: JSON_HEADERS,
	});
}
