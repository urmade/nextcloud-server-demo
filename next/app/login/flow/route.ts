import {
	handleLoginFlowV1GenerateAppPassword,
	handleLoginFlowV1ShowAuthPicker,
} from '@/src/server/auth/login-flow-v1';
import { resolveSession } from '@/src/server/auth/session';

export async function GET(request: Request) {
	const url = new URL(request.url);
	const clientIdentifier = url.searchParams.get('clientIdentifier') ?? '';
	const user = url.searchParams.get('user') ?? '';
	const direct = Number.parseInt(url.searchParams.get('direct') ?? '0', 10);
	const providedRedirectUri = url.searchParams.get('providedRedirectUri') ?? '';

	return handleLoginFlowV1ShowAuthPicker(
		request,
		resolveSession(request),
		clientIdentifier,
		user,
		direct,
		providedRedirectUri,
	);
}

export async function POST(request: Request) {
	const body = await request.text();

	return handleLoginFlowV1GenerateAppPassword(request, resolveSession(request), body);
}
