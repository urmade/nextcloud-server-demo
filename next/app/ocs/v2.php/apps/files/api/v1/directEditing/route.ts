import { handleDirectEditingInfo } from '@/src/server/files/direct-editing';

export function GET(request: Request) {
	return handleDirectEditingInfo(request);
}
