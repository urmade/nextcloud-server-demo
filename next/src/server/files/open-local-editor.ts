import {
	consumeOpenLocalEditorEntry,
	createOpenLocalEditorEntry,
	type OpenLocalEditorEntry,
} from './open-local-editor-store';
import { requireTemplatesOcsUser } from './templates-auth';
import {
	ocsFailureResponse,
	ocsSuccessResponse,
	parseOcsVersion,
} from '@/src/server/ocs/respond';

function formatEntry(entry: OpenLocalEditorEntry) {
	return {
		userId: entry.userId,
		pathHash: entry.pathHash,
		expirationTime: entry.expirationTime,
		token: entry.token,
	};
}

function currentUnixTime(): number {
	return Math.floor(Date.now() / 1000);
}

export async function handleOpenLocalEditorCreate(request: Request): Promise<Response> {
	const ocsVersion = parseOcsVersion(request);
	const body = await request.json().catch(() => null) as { path?: string } | null;
	const auth = requireTemplatesOcsUser(request, body ?? undefined);

	if (auth instanceof Response) {
		return auth;
	}

	if (!body?.path) {
		return new Response(null, { status: 400 });
	}

	const entry = createOpenLocalEditorEntry(auth, body.path, currentUnixTime());

	return ocsSuccessResponse(formatEntry(entry), ocsVersion);
}

export async function handleOpenLocalEditorValidate(request: Request, token: string): Promise<Response> {
	const ocsVersion = parseOcsVersion(request);
	const body = await request.json().catch(() => null) as { path?: string } | null;
	const auth = requireTemplatesOcsUser(request, body ?? undefined);

	if (auth instanceof Response) {
		return auth;
	}

	if (!body?.path) {
		return new Response(null, { status: 400 });
	}

	const entry = consumeOpenLocalEditorEntry(auth, body.path, token);

	if (!entry) {
		return ocsFailureResponse(ocsVersion, 404, '', []);
	}

	if (entry.expirationTime <= currentUnixTime()) {
		return ocsFailureResponse(ocsVersion, 404, '', []);
	}

	return ocsSuccessResponse(formatEntry(entry), ocsVersion);
}
