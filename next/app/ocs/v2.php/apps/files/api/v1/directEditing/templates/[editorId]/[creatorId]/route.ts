import { handleDirectEditingTemplates } from '@/src/server/files/direct-editing';

export function GET(
	request: Request,
	context: { params: Promise<{ editorId: string; creatorId: string }> },
) {
	return context.params.then(({ editorId, creatorId }) => handleDirectEditingTemplates(request, editorId, creatorId));
}
