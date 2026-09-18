import { handleCapabilitiesGet } from '@/src/server/ocs/handler';
import { buildOcsFailureEnvelope, getOcsHttpStatus } from '@/src/server/ocs/envelope';

export async function GET(request: Request) {
	return handleCapabilitiesGet(request, 2);
}

export async function PUT() {
	const payload = buildOcsFailureEnvelope(2, 405, 'Method not allowed');

	return Response.json(payload, {
		status: getOcsHttpStatus(2, 405),
		headers: {
			'content-type': 'application/json; charset=utf-8',
		},
	});
}
