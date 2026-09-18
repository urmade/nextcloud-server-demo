import { handleExtractPublicReferences } from '@/src/server/reference/api';

export async function POST(request: Request) {
	return await handleExtractPublicReferences(request);
}
