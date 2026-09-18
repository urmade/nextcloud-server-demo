import { buildOcsProviderCatalog } from '@/src/server/ocs/provider';

export async function GET() {
	return Response.json(buildOcsProviderCatalog(), {
		status: 200,
		headers: {
			'content-type': 'application/json; charset=utf-8',
		},
	});
}
