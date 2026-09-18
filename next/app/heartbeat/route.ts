import { handleHeartbeatGet } from '@/src/server/heartbeat';

export async function GET(request: Request) {
	return handleHeartbeatGet(request);
}
