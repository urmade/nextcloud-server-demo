import { handleTranslationTranslate } from '@/src/server/translation/api';

export async function POST(request: Request) {
	return await handleTranslationTranslate(request);
}
