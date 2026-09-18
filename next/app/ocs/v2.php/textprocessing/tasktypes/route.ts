import { handleTextProcessingTaskTypes } from '@/src/server/text-processing/api';

export async function GET(request: Request) {
	return await handleTextProcessingTaskTypes(request);
}
