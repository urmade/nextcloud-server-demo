import { handleTextToImageIsAvailable } from '@/src/server/text-to-image/api';

export async function GET(request: Request) {
	return await handleTextToImageIsAvailable(request);
}
