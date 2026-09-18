import { handleTextToImageSchedule } from '@/src/server/text-to-image/api';

export async function POST(request: Request) {
	return await handleTextToImageSchedule(request);
}
