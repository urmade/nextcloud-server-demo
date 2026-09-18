import { handleTranslationLanguages } from '@/src/server/translation/api';

export async function GET(request: Request) {
	return await handleTranslationLanguages(request);
}
