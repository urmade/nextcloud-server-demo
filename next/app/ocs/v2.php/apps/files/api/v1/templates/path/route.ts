import { handleTemplatePath } from '@/src/server/files/templates';

export async function POST(request: Request) {
	return handleTemplatePath(request);
}
