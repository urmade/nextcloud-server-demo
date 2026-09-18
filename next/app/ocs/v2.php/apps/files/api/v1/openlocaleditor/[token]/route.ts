import { handleOpenLocalEditorValidate } from '@/src/server/files/open-local-editor';

export async function POST(
	request: Request,
	context: { params: Promise<{ token: string }> },
) {
	const { token } = await context.params;

	return handleOpenLocalEditorValidate(request, token);
}
