import { seedParityWipeTokensIfNeeded } from '@/src/server/wipe/catalog';
import { startRemoteWipe, finishRemoteWipe } from '@/src/server/wipe/store';

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'content-type': 'application/json; charset=utf-8',
		},
	});
}

function wipeNotFoundResponse(): Response {
	return jsonResponse(404, []);
}

async function parseToken(request: Request): Promise<string | null> {
	const body = await request.json().catch(() => null);

	if (!body || typeof body !== 'object' || typeof (body as { token?: unknown }).token !== 'string') {
		return null;
	}

	return (body as { token: string }).token;
}

export async function handleCheckWipe(request: Request): Promise<Response> {
	seedParityWipeTokensIfNeeded();

	const token = await parseToken(request);

	if (!token) {
		return wipeNotFoundResponse();
	}

	const result = startRemoteWipe(token);

	if (result !== 'ok') {
		return wipeNotFoundResponse();
	}

	return jsonResponse(200, { wipe: true });
}

export async function handleWipeDone(request: Request): Promise<Response> {
	seedParityWipeTokensIfNeeded();

	const token = await parseToken(request);

	if (!token) {
		return wipeNotFoundResponse();
	}

	const result = finishRemoteWipe(token);

	if (result !== 'ok') {
		return wipeNotFoundResponse();
	}

	return jsonResponse(200, {});
}
