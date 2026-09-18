import { handleTextProcessingSchedule } from '@/src/server/text-processing/api';

export async function POST(request: Request) {
	return await handleTextProcessingSchedule(request);
}
