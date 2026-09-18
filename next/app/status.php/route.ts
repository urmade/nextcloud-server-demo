import { getStatusPayload } from '@/src/server/status';

export async function GET() {
	const payload = getStatusPayload();

	return new Response(JSON.stringify(payload), {
		status: 200,
		headers: {
			'access-control-allow-origin': '*',
			'content-type': 'application/json',
			'cache-control': 'no-store',
		},
	});
}
