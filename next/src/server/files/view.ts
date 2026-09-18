import { findNodeWithPathByFileId } from '@/src/server/dav/files';
import { resolveAuthenticatedUserId } from '@/src/server/ocs/auth';
import { buildDefaultContentSecurityPolicy } from '@/src/server/http/content-security-policy';
import {
	getDirectEditToken,
	invalidateDirectEditToken,
	markDirectEditTokenAccessed,
} from './direct-editing-store';

const JSON_HEADERS = {
	'content-type': 'application/json; charset=utf-8',
};

const HTML_CONTENT_TYPE = 'text/html; charset=UTF-8';

function acceptsHtml(request: Request): boolean {
	return (request.headers.get('accept') ?? '').toLowerCase().includes('html');
}

function unauthorizedJson(): Response {
	return new Response(JSON.stringify({ message: 'Current user is not logged in' }), {
		status: 401,
		headers: JSON_HEADERS,
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

export function requireFilesViewUser(request: Request): string | Response {
	const userId = resolveAuthenticatedUserId(request);

	if (!userId) {
		if (acceptsHtml(request)) {
			return buildLoginRedirect(request);
		}

		return unauthorizedJson();
	}

	return userId;
}

function redirect303(location: string): Response {
	return new Response(null, {
		status: 303,
		headers: {
			location,
		},
	});
}

function buildFilesShellHtml(): string {
	return `<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8" />
	<title>Files</title>
</head>
<body id="content" class="files-app-shell"></body>
</html>`;
}

function buildFilesShellResponse(): Response {
	return new Response(buildFilesShellHtml(), {
		status: 200,
		headers: {
			'content-type': HTML_CONTENT_TYPE,
			'content-security-policy': buildDefaultContentSecurityPolicy(),
		},
	});
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

function buildDirectEditingHtml(token: string): string {
	return `<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8" />
	<title>Direct editing</title>
</head>
<body data-direct-editing-token="${token}"></body>
</html>`;
}

function resolveOpenParam(value: string | null | undefined, defaultValue: string): string {
	if (value === undefined || value === null) {
		return defaultValue;
	}

	return value !== 'false' ? 'true' : 'false';
}

function buildIndexViewFileidLocation(
	view: string,
	fileid: string,
	params: URLSearchParams,
): string {
	const query = params.toString();

	return `/index.php/apps/files/${encodeURIComponent(view)}/${encodeURIComponent(fileid)}${query ? `?${query}` : ''}`;
}

export function handleFilesViewIndex(
	request: Request,
	options: {
		dir?: string;
		view?: string;
		fileid?: string | null;
	} = {},
): Response {
	const auth = requireFilesViewUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	void options;

	return buildFilesShellResponse();
}

export function handleShowFile(
	request: Request,
	fileid: string | undefined,
	query: {
		opendetails?: string | null;
		openfile?: string | null;
	} = {},
): Response {
	const auth = requireFilesViewUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	if (!fileid) {
		return redirect303('/index.php/apps/files/');
	}

	const parsedFileId = Number.parseInt(fileid, 10);

	if (!Number.isFinite(parsedFileId)) {
		return redirect303(buildIndexViewFileidLocation('files', fileid, new URLSearchParams()));
	}

	const located = findNodeWithPathByFileId(auth, parsedFileId);

	if (!located) {
		return redirect303(buildIndexViewFileidLocation('files', fileid, new URLSearchParams()));
	}

	const params = new URLSearchParams();

	if (located.node.kind === 'directory') {
		if (located.path) {
			params.set('dir', located.path);
		}
	} else {
		const parentDir = located.path.includes('/')
			? located.path.slice(0, located.path.lastIndexOf('/'))
			: '';

		if (parentDir) {
			params.set('dir', parentDir);
		}

		params.set('openfile', resolveOpenParam(query.openfile, 'true'));
	}

	if (query.opendetails !== undefined && query.opendetails !== null) {
		params.set('opendetails', resolveOpenParam(query.opendetails, 'true'));
	}

	if (query.openfile !== undefined && query.openfile !== null && located.node.kind !== 'file') {
		params.set('openfile', resolveOpenParam(query.openfile, 'true'));
	}

	return redirect303(buildIndexViewFileidLocation('files', fileid, params));
}

export function handleDirectEditingView(_request: Request, token: string): Response {
	const entry = getDirectEditToken(token);

	if (!entry || entry.accessed) {
		if (entry) {
			invalidateDirectEditToken(token);
		}

		return buildGuestNotFoundResponse();
	}

	markDirectEditTokenAccessed(token);

	return new Response(buildDirectEditingHtml(token), {
		status: 200,
		headers: {
			'content-type': HTML_CONTENT_TYPE,
		},
	});
}
