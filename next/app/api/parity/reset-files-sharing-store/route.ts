import { resetExternalShareStore } from '@/src/server/files_sharing/external-share-store';
import { resetShareStore } from '@/src/server/files_sharing/store';

export async function POST() {
	if (process.env.NC_PARITY_EXAPP !== 'true') {
		return new Response(null, { status: 404 });
	}

	resetShareStore();
	resetExternalShareStore();

	return new Response(null, { status: 204 });
}
