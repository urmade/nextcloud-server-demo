import { handleOpenLocalEditorCreate } from '@/src/server/files/open-local-editor';

export async function POST(request: Request) {
	return handleOpenLocalEditorCreate(request);
}
