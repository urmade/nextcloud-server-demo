import { parseCookieHeader, passesStrictCookieCheck, SESSION_COOKIE } from '@/src/server/auth/cookies';
import { isCsrfTokenValid } from '@/src/server/auth/csrf';
import { getSession } from '@/src/server/auth/session-store';
import { resolveAuthenticatedUserId } from '@/src/server/ocs/auth';
import { getGridViewEnabled, setGridViewEnabled } from './grid-view';
import { computeStorageStats } from './stats';
import {
	getUserConfigs,
	setShowHiddenFiles,
	setUserConfig,
	UserConfigValidationError,
} from './user-config';
import { resetFilesUserConfigStore } from './user-config-store';
import {
	getViewConfigs,
	setViewConfig,
	ViewConfigValidationError,
} from './view-config';
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

function csrfFailure(): Response {
	return new Response(JSON.stringify({ message: 'CSRF check failed' }), {
		status: 412,
		headers: JSON_HEADERS,
	});
}

function badRequest(message: string): Response {
	return new Response(JSON.stringify({ message }), {
		status: 400,
		headers: JSON_HEADERS,
	});
}

function emptyOk(): Response {
	return new Response(null, {
		status: 200,
	});
}

function extractRequestToken(request: Request, body?: Record<string, unknown>): string | null {
	const url = new URL(request.url);
	const queryToken = url.searchParams.get('requesttoken');

	if (queryToken) {
		return queryToken;
	}

	if (body && typeof body.requesttoken === 'string') {
		return body.requesttoken;
	}

	return request.headers.get('requesttoken');
}

function enforceFilesApiCsrf(request: Request, body?: Record<string, unknown>): Response | null {
	const cookies = parseCookieHeader(request.headers.get('cookie'));
	const session = getSession(cookies[SESSION_COOKIE]);
	const token = extractRequestToken(request, body);

	if (!isCsrfTokenValid(session?.csrfToken, token ?? '')) {
		return csrfFailure();
	}

	return null;
}

async function parseJsonBody(request: Request): Promise<Record<string, unknown>> {
	try {
		const text = await request.text();

		if (!text) {
			return {};
		}

		return JSON.parse(text) as Record<string, unknown>;
	} catch {
		return {};
	}
}

type FilesApiMutationContext = {
	userId: string;
	body: Record<string, unknown>;
};

export async function requireFilesApiMutation(request: Request): Promise<FilesApiMutationContext | Response> {
	const auth = requireFilesApiUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	const body = await parseJsonBody(request);
	const csrf = enforceFilesApiCsrf(request, body);

	if (csrf) {
		return csrf;
	}

	return {
		userId: auth,
		body,
	};
}

export async function handleSetConfig(request: Request, key: string): Promise<Response> {
	const context = await requireFilesApiMutation(request);

	if (context instanceof Response) {
		return context;
	}

	try {
		const data = setUserConfig(context.userId, key, context.body.value);

		return okEnvelope(data);
	} catch (error) {
		if (error instanceof UserConfigValidationError) {
			return badRequest(error.message);
		}

		throw error;
	}
}

export async function handleSetViewConfig(
	request: Request,
	view?: string,
	key?: string,
): Promise<Response> {
	const context = await requireFilesApiMutation(request);

	if (context instanceof Response) {
		return context;
	}

	const resolvedView = view ?? (typeof context.body.view === 'string' ? context.body.view : '');
	const resolvedKey = key ?? (typeof context.body.key === 'string' ? context.body.key : '');
	const value = context.body.value;

	try {
		const data = setViewConfig(context.userId, resolvedView, resolvedKey, value);

		return okEnvelope(data);
	} catch (error) {
		if (error instanceof ViewConfigValidationError) {
			return badRequest(error.message);
		}

		throw error;
	}
}

export async function handleShowHiddenFiles(request: Request): Promise<Response> {
	const context = await requireFilesApiMutation(request);

	if (context instanceof Response) {
		return context;
	}

	const value = context.body.value === true || context.body.value === '1' || context.body.value === 1;

	setShowHiddenFiles(context.userId, value);

	return emptyOk();
}

export async function handleShowGridView(request: Request): Promise<Response> {
	const context = await requireFilesApiMutation(request);

	if (context instanceof Response) {
		return context;
	}

	const show = context.body.show === true || context.body.show === '1' || context.body.show === 1;

	setGridViewEnabled(context.userId, show);

	return emptyOk();
}

export function resetFilesApiStores(): void {
	resetFilesUserConfigStore();
	resetFilesViewConfigStore();
}
