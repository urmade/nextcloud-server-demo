<<<<<<< HEAD
import { resetExternalShareStore } from '@/src/server/files_sharing/external-share-store';
=======
import { resetDavFileStore } from '@/src/server/dav/store';
>>>>>>> 625bdfb8ecb (fix(files): reset file-node id counters with the parity files stores)
import { resetShareStore } from '@/src/server/files_sharing/store';

export async function POST() {
	if (process.env.NC_PARITY_EXAPP !== 'true') {
		return new Response(null, { status: 404 });
	}

	resetShareStore();
<<<<<<< HEAD
	resetExternalShareStore();
=======
	resetDavFileStore();
>>>>>>> 625bdfb8ecb (fix(files): reset file-node id counters with the parity files stores)

	return new Response(null, { status: 204 });
}
