import { handleGetFolderTree } from '@/src/server/files/folder-tree';

export async function GET(request: Request) {
	return handleGetFolderTree(request);
}
