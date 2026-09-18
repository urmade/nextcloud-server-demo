import { getServiceWorkerResponse } from '@/src/server/files/service-worker';

export async function GET() {
	return getServiceWorkerResponse();
}
