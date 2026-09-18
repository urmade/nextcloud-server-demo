import { handleSetCreateExampleEvent } from '@/src/server/dav/example-content';

export async function POST(request: Request) {
	return handleSetCreateExampleEvent(request);
}
