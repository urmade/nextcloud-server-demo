import { parseCookieHeader, passesStrictCookieCheck } from '@/src/server/auth/cookies';
import { resolveAuthenticatedUserId } from '@/src/server/ocs/auth';
import { getGridViewEnabled } from './grid-view';
import { computeStorageStats } from './stats';
import { getUserConfigs } from './user-config';
import { resetFilesUserConfigStore } from './user-config-store';
import { getViewConfigs } from './view-config';
import { resetFilesViewConfigStore } from './view-config-store';

const JSON_HEADERS = {
	'content-type': 'application/json; charset=utf-8',
};

const CACHE_FIVE_MINUTES = 'private, max-age=300';

function acceptsHtml(request: Request): boolean {
	return (request.headers.get('accept') ?? '').toLowerCase().includes('html');
}

function redirectToRoot(): Response {
	return new Response(null, {
		status: 303,
		headers: {
			location: '/',
		},
	});
}

function unauthorizedJson(): Response {
	return new Response(JSON.stringify({ message: 'Current user is not logged in' }), {
		status: 401,
		headers: JSON_HEADERS,
	});
}

export function requireFilesApiUser(request: Request): string | Response {
	const cookies = parseCookieHeader(request.headers.get('cookie'));
	const ocsApiRequest = Boolean(request.headers.get('ocs-apirequest'));

	if (!passesStrictCookieCheck(cookies, ocsApiRequest)) {
		return redirectToRoot();
	}

	const userId = resolveAuthenticatedUserId(request);

	if (!userId) {
		if (acceptsHtml(request)) {
			const redirectUrl = encodeURIComponent(new URL(request.url).pathname);
			return new Response(null, {
				status: 303,
				headers: {
					location: `/login?redirect_url=${redirectUrl}`,
				},
			});
		}

		return unauthorizedJson();
	}

	return userId;
}

function okEnvelope(data: unknown, cache = false): Response {
	const headers = new Headers(JSON_HEADERS);

	if (cache) {
		headers.set('cache-control', CACHE_FIVE_MINUTES);
	}

	return new Response(JSON.stringify({ message: 'ok', data }), {
		status: 200,
		headers,
	});
}

export function handleGetConfigs(request: Request): Response {
	const auth = requireFilesApiUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	return okEnvelope(getUserConfigs(auth));
}

export function handleGetViewConfigs(request: Request): Response {
	const auth = requireFilesApiUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	return okEnvelope(getViewConfigs(auth));
}

export function handleGetStorageStats(request: Request): Response {
	const auth = requireFilesApiUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const url = new URL(request.url);
	const dir = url.searchParams.get('dir') ?? '/';

	return okEnvelope(computeStorageStats(auth, dir), true);
}

export function handleGetGridView(request: Request): Response {
	const auth = requireFilesApiUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	return new Response(JSON.stringify({ gridview: getGridViewEnabled(auth) }), {
		status: 200,
		headers: JSON_HEADERS,
	});
}

export function resetFilesApiStores(): void {
	resetFilesUserConfigStore();
	resetFilesViewConfigStore();
}
