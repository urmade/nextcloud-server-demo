import { handleTemplateCreate } from '@/src/server/files/templates';

export async function POST(request: Request) {
	return handleTemplateCreate(request);
}
