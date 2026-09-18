import { seedParityExternalShare } from '@/src/server/files_sharing/external-share-store';
import type { ExternalShareRecord } from '@/src/server/files_sharing/types';

export async function POST(request: Request) {
	if (process.env.NC_PARITY_EXAPP !== 'true') {
		return new Response(null, { status: 404 });
	}

	const body = await request.json() as Omit<ExternalShareRecord, 'id'> & { id?: string };

	seedParityExternalShare(body);

	return new Response(null, { status: 204 });
}
