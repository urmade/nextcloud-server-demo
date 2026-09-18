import { handleTemplateListFields } from '@/src/server/files/templates';

export function GET(
	request: Request,
	context: { params: Promise<{ fileId: string }> },
) {
	return context.params.then(({ fileId }) => handleTemplateListFields(request, Number.parseInt(fileId, 10)));
}
