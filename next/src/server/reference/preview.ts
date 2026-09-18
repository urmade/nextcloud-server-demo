import { getReferencePreviewFixture } from '@/src/server/fixtures/binary';
import { binaryResponse, cacheForSeconds } from '@/src/server/http/binary';

const KNOWN_REFERENCE_IDS = new Set(['parity-reference']);

export function getReferencePreviewResponse(referenceId: string): Response {
	if (!KNOWN_REFERENCE_IDS.has(referenceId)) {
		return new Response('', {
			status: 404,
			headers: {
				'content-type': 'application/json; charset=utf-8',
			},
		});
	}

	const bytes = getReferencePreviewFixture();
	const response = binaryResponse(bytes, 200, 'image/png');

	return cacheForSeconds(response, 3600);
}
