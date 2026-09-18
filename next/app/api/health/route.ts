import { getHealthPayload } from '@/src/server/health';

export async function GET() {
	const payload = getHealthPayload();

	return Response.json(payload, {
		status: 200,
		headers: {
			'cache-control': 'no-store',
		},
	});
}
