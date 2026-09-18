import { handleTemplateList } from '@/src/server/files/templates';

export function GET(request: Request) {
	return handleTemplateList(request);
}
