import { resetDavFileStore } from '@/src/server/dav/store';
import { resetShareStore } from '@/src/server/files_sharing/store';

export async function POST() {
	if (process.env.NC_PARITY_EXAPP !== 'true') {
		return new Response(null, { status: 404 });
	}

	resetShareStore();
	resetDavFileStore();

	return new Response(null, { status: 204 });
}
