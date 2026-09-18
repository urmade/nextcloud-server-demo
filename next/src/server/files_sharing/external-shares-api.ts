import { isCsrfTokenValid } from '@/src/server/auth/csrf';
import { resolveSession } from '@/src/server/auth/session';
import { resolveAuthenticatedUserId } from '@/src/server/ocs/auth';
import { isIncomingServer2ServerShareEnabled } from './config';
import { SHARE_STATUS_PENDING } from './constants';
import {
	acceptExternalShare,
	declineExternalShare,
	getExternalShareById,
	listExternalSharesForUser,
} from './external-share-store';
import { formatExternalShare } from './format';

const JSON_HEADERS = {
	'content-type': 'application/json; charset=utf-8',
};

const NOT_LOGGED_IN = 'Current user is not logged in';
const CSRF_FAILED = 'CSRF check failed';
const FEDERATION_NOT_ALLOWED = 'Federated sharing not allowed';

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: JSON_HEADERS,
	});
}

function unauthorizedJson(): Response {
	return jsonResponse(401, { message: NOT_LOGGED_IN });
}

function csrfFailure(): Response {
	return jsonResponse(412, { message: CSRF_FAILED });
}

function federationNotAllowed(): Response {
	return jsonResponse(405, FEDERATION_NOT_ALLOWED);
}

function emptyArraySuccess(): Response {
	return jsonResponse(200, []);
}

function getRequestToken(request: Request, body?: URLSearchParams): string {
	return request.headers.get('requesttoken')
		?? body?.get('requesttoken')
		?? '';
}

function passesCsrfCheck(request: Request, body?: URLSearchParams): boolean {
	if (request.headers.get('ocs-apirequest')) {
		return true;
	}

	const resolved = resolveSession(request);

	return isCsrfTokenValid(resolved.session.csrfToken, getRequestToken(request, body));
}

function requireAuthenticatedUser(request: Request): string | Response {
	const userId = resolveAuthenticatedUserId(request);

	if (!userId) {
		return unauthorizedJson();
	}

	return userId;
}

function requireExternalSharesAccess(request: Request, body?: URLSearchParams): string | Response {
	const auth = requireAuthenticatedUser(request);

	if (auth instanceof Response) {
		return auth;
	}

	if (!passesCsrfCheck(request, body)) {
		return csrfFailure();
	}

	if (!isIncomingServer2ServerShareEnabled()) {
		return federationNotAllowed();
	}

	return auth;
}

export function handleExternalSharesIndex(request: Request): Response {
	const auth = requireExternalSharesAccess(request);

	if (auth instanceof Response) {
		return auth;
	}

	const shares = listExternalSharesForUser(auth, SHARE_STATUS_PENDING).map(formatExternalShare);

	return jsonResponse(200, shares);
}

export async function handleExternalSharesCreate(request: Request): Promise<Response> {
	let bodyText = '';

	try {
		bodyText = await request.text();
	} catch {
		bodyText = '';
	}

	const body = new URLSearchParams(bodyText);
	let id: string | undefined;

	try {
		const parsed = bodyText.trim() === '' ? {} : JSON.parse(bodyText) as { id?: unknown };
		id = typeof parsed.id === 'string' ? parsed.id : undefined;
	} catch {
		id = body.get('id') ?? undefined;
	}

	if (id === undefined) {
		return new Response(null, { status: 400 });
	}

	const auth = requireExternalSharesAccess(request, body);

	if (auth instanceof Response) {
		return auth;
	}

	const share = getExternalShareById(id, auth);

	if (share) {
		acceptExternalShare(id, auth);
	}

	return emptyArraySuccess();
}

export function handleExternalSharesDestroy(request: Request, id: string): Response {
	const auth = requireExternalSharesAccess(request);

	if (auth instanceof Response) {
		return auth;
	}

	const share = getExternalShareById(id, auth);

	if (share) {
		declineExternalShare(id, auth);
	}

	return emptyArraySuccess();
}

export function handleExternalSharesMissingMethod(): Response {
	return new Response(null, { status: 500 });
}
