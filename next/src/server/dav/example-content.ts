import { isCsrfTokenValid } from '@/src/server/auth/csrf';
import { parseCookieHeader, SESSION_COOKIE } from '@/src/server/auth/cookies';
import { getSession } from '@/src/server/auth/session-store';
import { isAdminUserId } from '@/src/server/ocs/admin-auth';
import { resolveAuthenticatedUserId } from '@/src/server/ocs/auth';
import {
	createInitialDefaultContact,
	defaultContactExists,
	deleteCustomExampleEvent,
	getDefaultContactDownload,
	getExampleEventIcs,
	isDefaultContactEnabled,
	saveCustomExampleEvent,
	setCreateExampleEventEnabled,
	setDefaultContactCard,
	setDefaultContactEnabled,
	shouldCreateExampleEvent,
} from './example-content-store';

const JSON_HEADERS = {
	'content-type': 'application/json; charset=utf-8',
};

const HTML_CONTENT_TYPE = 'text/html; charset=UTF-8';

const NOT_LOGGED_IN_MESSAGE = 'Current user is not logged in';
const ADMIN_REQUIRED_MESSAGE = 'Logged in account must be an admin, a sub admin or gotten special right to access this setting';

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: JSON_HEADERS,
	});
}

function acceptsHtml(request: Request): boolean {
	return (request.headers.get('accept') ?? '').toLowerCase().includes('html');
}

function buildGuestForbiddenHtml(message: string): string {
	return `<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8" />
	<title>Access forbidden</title>
</head>
<body class="guest">
<div class="body-login-container update">
	<h2>Access forbidden</h2>
	<p class="hint">${message}</p>
</div>
</body>
</html>`;
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

	return jsonResponse(401, { message: NOT_LOGGED_IN_MESSAGE });
}

function forbiddenResponse(request: Request): Response {
	if (acceptsHtml(request)) {
		return new Response(buildGuestForbiddenHtml(ADMIN_REQUIRED_MESSAGE), {
			status: 403,
			headers: {
				'content-type': HTML_CONTENT_TYPE,
			},
		});
	}

	return jsonResponse(403, { message: ADMIN_REQUIRED_MESSAGE });
}

function csrfFailedResponse(): Response {
	return jsonResponse(412, { message: 'CSRF check failed' });
}

function successResponse(): Response {
	return jsonResponse(200, []);
}

function extractRequestToken(request: Request): string {
	const url = new URL(request.url);
	const queryToken = url.searchParams.get('requesttoken');

	if (queryToken) {
		return queryToken;
	}

	const headerToken = request.headers.get('requesttoken');

	return headerToken ?? '';
}

async function parseJsonBody(request: Request): Promise<Record<string, unknown>> {
	try {
		const body = await request.json();

		if (body && typeof body === 'object' && !Array.isArray(body)) {
			return body as Record<string, unknown>;
		}
	} catch {
		// fall through
	}

	return {};
}

function requireExampleContentAdmin(request: Request, requireCsrf: boolean): string | Response {
	const userId = resolveAuthenticatedUserId(request);

	if (!userId) {
		return unauthenticatedResponse(request);
	}

	if (requireCsrf) {
		const cookies = parseCookieHeader(request.headers.get('cookie'));
		const session = getSession(cookies[SESSION_COOKIE]);
		const token = extractRequestToken(request);

		if (!isCsrfTokenValid(session?.csrfToken, token)) {
			return csrfFailedResponse();
		}
	}

	if (!isAdminUserId(userId)) {
		return forbiddenResponse(request);
	}

	return userId;
}

function downloadResponse(body: string, filename: string, contentType: string): Response {
	return new Response(body, {
		status: 200,
		headers: {
			'content-type': contentType,
			'content-disposition': `attachment; filename="${filename}"`,
		},
	});
}

export function handleSetEnableDefaultContact(request: Request, allow: boolean): Response {
	const auth = requireExampleContentAdmin(request, true);

	if (auth instanceof Response) {
		return auth;
	}

	if (allow && !defaultContactExists()) {
		try {
			createInitialDefaultContact();
		} catch {
			return jsonResponse(500, []);
		}
	}

	setDefaultContactEnabled(allow);

	return successResponse();
}

export async function handleSetEnableDefaultContactRequest(request: Request): Promise<Response> {
	const body = await parseJsonBody(request);
	const allow = body.allow === true;

	return handleSetEnableDefaultContact(request, allow);
}

export function handleGetDefaultContact(request: Request): Response {
	const auth = requireExampleContentAdmin(request, false);

	if (auth instanceof Response) {
		return auth;
	}

	return downloadResponse(getDefaultContactDownload(), 'example_contact.vcf', 'text/vcard');
}

export async function handleSetDefaultContact(request: Request): Promise<Response> {
	const auth = requireExampleContentAdmin(request, true);

	if (auth instanceof Response) {
		return auth;
	}

	if (!isDefaultContactEnabled()) {
		return jsonResponse(403, []);
	}

	const body = await parseJsonBody(request);
	const contactData = typeof body.contactData === 'string' ? body.contactData : null;

	try {
		setDefaultContactCard(contactData);
	} catch {
		return jsonResponse(500, []);
	}

	return successResponse();
}

export async function handleSetCreateExampleEvent(request: Request): Promise<Response> {
	const auth = requireExampleContentAdmin(request, true);

	if (auth instanceof Response) {
		return auth;
	}

	const body = await parseJsonBody(request);
	const enable = body.enable === true;

	setCreateExampleEventEnabled(enable);

	return successResponse();
}

export function handleDownloadExampleEvent(request: Request): Response {
	const auth = requireExampleContentAdmin(request, false);

	if (auth instanceof Response) {
		return auth;
	}

	return downloadResponse(getExampleEventIcs(), 'example_event.ics', 'text/calendar');
}

export async function handleUploadExampleEvent(request: Request): Promise<Response> {
	const auth = requireExampleContentAdmin(request, true);

	if (auth instanceof Response) {
		return auth;
	}

	if (!shouldCreateExampleEvent()) {
		return jsonResponse(403, []);
	}

	const body = await parseJsonBody(request);
	const ics = typeof body.ics === 'string' ? body.ics : '';

	try {
		saveCustomExampleEvent(ics);
	} catch {
		return jsonResponse(400, []);
	}

	return successResponse();
}

export function handleDeleteExampleEvent(request: Request): Response {
	const auth = requireExampleContentAdmin(request, true);

	if (auth instanceof Response) {
		return auth;
	}

	deleteCustomExampleEvent();

	return successResponse();
}
